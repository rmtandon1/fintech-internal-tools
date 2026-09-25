import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import { previewActions } from "@console/engine/policy/preview";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  clusteringWindowDays,
  notReceivedByMerchant,
  refundTool,
} from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, refundsAgent, setupHarness } from "../helpers/harness";

const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

describe("refunds clusters", () => {
  it("declares the merchant_not_received cluster on the tool", () => {
    const cluster = refundTool.clusters?.find((c) => c.id === "merchant_not_received");
    expect(cluster).toBeDefined();
    expect(cluster?.traceAction).toBe("execute");
    expect(cluster?.handoffSpec).toBe("REFUND_CLUSTERING_HOLD.md");
    expect(cluster?.groups()).toEqual(notReceivedByMerchant());
  });

  it("groups the seeded Kestrel refunds into one group totalling 188,000", () => {
    const groups = notReceivedByMerchant();
    expect(groups).toHaveLength(1);
    const [kestrel] = groups;
    expect(kestrel.key).toBe("Kestrel Outdoors");
    expect(kestrel.label).toBe("Kestrel Outdoors");
    expect(kestrel.count).toBe(4);
    expect(kestrel.qualifier).toBe("not_received");
    expect(kestrel.windowDays).toBe(14);
    expect(kestrel.totalUsdMinor).toBe(188_000);
    expect(kestrel.headline).toBe("4 refunds from Kestrel Outdoors add up to $1,880");
    expect(kestrel.limit).toEqual({ usdMinor: 50_000, label: "$500 needs a manager" });
    expect([...kestrel.recordIds].sort()).toEqual([
      "rfnd_0011",
      "rfnd_0012",
      "rfnd_0013",
      "rfnd_0014",
    ]);
  });

  it("every row in the group is allowed on its own by amount_approval", () => {
    const [kestrel] = notReceivedByMerchant();
    for (const id of kestrel.recordIds) {
      const record = refundTool.get(id);
      if (!record) throw new Error(`missing ${id}`);
      const preview = previewActions(refundTool, record, refundsAgent).find(
        (p) => p.action === "execute",
      );
      expect(preview?.decision?.effect).toBe("allow");
      expect(preview?.decision?.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
    }
  });

  it("excludes a merchant whose single refund is over the manager line", () => {
    const now = Date.now();
    db.insert(refunds)
      .values({
        id: "rfnd_test_big",
        paymentId: "pay_test_big",
        customerEmail: "big@example.com",
        cardLast4: "0001",
        merchant: "Big Ticket Co",
        psp: "stripe",
        currency: "USD",
        capturedMinor: 90_000,
        refundedMinor: 0,
        amountMinor: 90_000,
        usdMinor: 90_000,
        reasonCode: "not_received",
        disputed: 0,
        status: "requested",
        requestedBy: null,
        requestedAt: now - DAY,
        settledAt: null,
        lastNote: null,
        version: 1,
      })
      .run();
    const merchants = notReceivedByMerchant().map((g) => g.key);
    expect(merchants).not.toContain("Big Ticket Co");
    expect(merchants).toContain("Kestrel Outdoors");
  });

  it("rejected refunds do not count toward the total", () => {
    db.update(refunds)
      .set({ status: "rejected" })
      .where(eq(refunds.id, "rfnd_0014"))
      .run();
    const kestrel = notReceivedByMerchant().find((g) => g.key === "Kestrel Outdoors");
    expect(kestrel?.count).toBe(3);
    expect([...(kestrel?.recordIds ?? [])].sort()).toEqual(["rfnd_0011", "rfnd_0012", "rfnd_0013"]);
    expect(kestrel?.totalUsdMinor).toBe(48_000 + 47_500 + 46_000);

    db.update(refunds)
      .set({ status: "requested" })
      .where(eq(refunds.id, "rfnd_0014"))
      .run();
  });

  it("aggregates contain no PII fields", () => {
    const piiFields = refundTool.fields.filter((f) => f.isPII).map((f) => f.name);
    expect(piiFields.length).toBeGreaterThan(0);
    for (const group of notReceivedByMerchant()) {
      expect(Object.keys(group)).toEqual([
        "key",
        "label",
        "count",
        "qualifier",
        "totalUsdMinor",
        "windowDays",
        "recordIds",
        "headline",
        "detail",
        "limit",
      ]);
      for (const field of piiFields) expect(group).not.toHaveProperty(field);
      expect(JSON.stringify(group)).not.toMatch(/@example\.com/);
    }
  });

  it("falls back to a 14 day window when the constant is 0", () => {
    registerConstants([
      {
        key: CLUSTERING_WINDOW_DAYS_KEY,
        value: 14,
        type: "number",
        description: "Days of refunds a cluster looks back over",
        tool: "refunds",
      },
    ]);
    expect(clusteringWindowDays()).toBe(14);

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    expect(clusteringWindowDays()).toBe(14);
    expect(notReceivedByMerchant().find((g) => g.key === "Kestrel Outdoors")?.count).toBe(4);

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "1").ok).toBe(true);
    expect(clusteringWindowDays()).toBe(1);
    expect(notReceivedByMerchant().find((g) => g.key === "Kestrel Outdoors")).toBeUndefined();
  });
});
