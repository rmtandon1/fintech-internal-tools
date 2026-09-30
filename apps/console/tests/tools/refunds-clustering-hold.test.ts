import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { CLUSTERING_WINDOW_DAYS_KEY, queueOf, type Refund, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, analyst, setupHarness } from "../helpers/harness";

// Seeded Kestrel "not received" refunds in request order, all under the $500 line:
// rfnd_0014 $465 → $465, rfnd_0013 $460 → $925, rfnd_0012 $475 → $1,400, rfnd_0011 $480 → $1,880.

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

beforeEach(() => {
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
});

function act(actor: Actor, action: string, recordId: string) {
  return executeIntent(actor, {
    tool: "refunds",
    action,
    recordId,
    input: {},
    idempotencyKey: ulid(),
  });
}

function executePreview(recordId: string) {
  const record = refundTool.get(recordId);
  if (!record) throw new Error(`missing ${recordId}`);
  return previewActions(refundTool, record, analyst).find((p) => p.action === "execute")?.decision;
}

function queue(recordId: string) {
  const record = refundTool.get(recordId);
  if (!record) throw new Error(`missing ${recordId}`);
  return queueOf(record as Refund);
}

function listed(q: "analyst" | "manager"): string[] {
  return refundTool.list({ filters: { queue: q }, limit: 1000, offset: 0 }).rows.map((r) => r.id);
}

function setStatus(id: string, status: string): void {
  db.update(refunds).set({ status }).where(eq(refunds.id, id)).run();
}

describe("refund clustering hold", () => {
  it("declares refunds.clustering_window_days at 0, and at 0 clustering_hold allows every refund", () => {
    const declared = refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY);
    expect(declared).toMatchObject({ value: 0, type: "number", tool: "refunds" });

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    for (const id of ["rfnd_0014", "rfnd_0013", "rfnd_0012", "rfnd_0011"]) {
      const decision = executePreview(id);
      expect(decision?.effect).toBe("allow");
      expect(decision?.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
      expect(queue(id)).toBe("analyst");
    }
  });

  it("sends the refund that takes the merchant's total over the line to the manager's queue, naming the merchant and running total", () => {
    const decision = executePreview("rfnd_0013");
    expect(decision?.effect).toBe("require_approval");
    expect(decision?.trace).toContainEqual({
      type: "require_approval",
      rule: "clustering_hold",
      tier: "manager",
      allowedRoles: ["manager"],
      reason: 'Kestrel Outdoors "not received" refunds reach $925 in 14 days, over the $500 manager limit',
    });
    expect(queue("rfnd_0013")).toBe("manager");
    expect(listed("manager")).toContain("rfnd_0013");
    expect(listed("analyst")).not.toContain("rfnd_0013");

    const outcome = act(analyst, "execute", "rfnd_0013").outcome;
    expect(outcome).toMatchObject({ status: "error", code: "forbidden_role" });
    expect(refundTool.get("rfnd_0013")?.status).toBe("requested");
  });

  it("routes every later refund in the same cluster to the manager's queue too", () => {
    const totals: Record<string, string> = { rfnd_0012: "$1,400", rfnd_0011: "$1,880" };
    for (const [id, total] of Object.entries(totals)) {
      const hold = executePreview(id)?.trace.find((o) => o.rule === "clustering_hold");
      expect(hold).toMatchObject({ type: "require_approval", tier: "manager" });
      expect(hold && "reason" in hold ? hold.reason : "").toContain(`reach ${total}`);
      expect(queue(id)).toBe("manager");
      expect(listed("manager")).toContain(id);
    }
  });

  it("does not affect a faulty refund from the same merchant", () => {
    const now = Date.now();
    db.insert(refunds)
      .values({
        id: "rfnd_test_faulty",
        paymentId: "pay_test_faulty",
        customerEmail: "faulty@example.com",
        cardLast4: "0002",
        merchant: "Kestrel Outdoors",
        psp: "stripe",
        currency: "USD",
        capturedMinor: 30_000,
        refundedMinor: 0,
        amountMinor: 30_000,
        usdMinor: 30_000,
        reasonCode: "faulty",
        disputed: 0,
        status: "requested",
        requestedBy: null,
        requestedAt: now - 60 * 60 * 1000,
        settledAt: null,
        lastNote: null,
        version: 1,
      })
      .run();
    const decision = executePreview("rfnd_test_faulty");
    expect(decision?.effect).toBe("allow");
    expect(decision?.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    expect(queue("rfnd_test_faulty")).toBe("analyst");
    expect(executePreview("rfnd_0013")?.trace).toContainEqual(
      expect.objectContaining({ rule: "clustering_hold", reason: expect.stringContaining("reach $925") }),
    );
  });

  it("does not count rejected refunds toward the total", () => {
    setStatus("rfnd_0014", "rejected");
    try {
      expect(executePreview("rfnd_0013")?.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
      expect(queue("rfnd_0013")).toBe("analyst");
      expect(executePreview("rfnd_0012")?.trace).toContainEqual(
        expect.objectContaining({ rule: "clustering_hold", reason: expect.stringContaining("reach $935") }),
      );
      expect(queue("rfnd_0014")).toBeNull();
    } finally {
      setStatus("rfnd_0014", "requested");
    }
  });

  it("applies the first refund in a cluster while its running total is under the manager line", () => {
    expect(queue("rfnd_0014")).toBe("analyst");
    const outcome = act(analyst, "execute", "rfnd_0014").outcome;
    expect(outcome.status).toBe("applied");
    if (!("trace" in outcome) || !outcome.trace) throw new Error("outcome has no trace");
    expect(outcome.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    expect(refundTool.get("rfnd_0014")?.status).toBe("executing");
    expect(queue("rfnd_0013")).toBe("manager");
  });
});
