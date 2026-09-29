import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { listApprovals } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  clusteringWindowDays,
  heldRefunds,
  refundTool,
} from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

afterEach(() => {
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
});

function execute(actor: Actor, id: string) {
  const record = refundTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  const preview = previewActions(refundTool, record, actor).find((p) => p.action === "execute");
  if (!preview?.decision) throw new Error(`no execute decision for ${id}`);
  return { ...preview, decision: preview.decision };
}

function hold(id: string) {
  return execute(analyst, id).decision.trace.find((o) => o.rule === "clustering_hold");
}

function queue(name: "analyst" | "manager"): string[] {
  return refundTool
    .list({ filters: { queue: name }, limit: 1000, offset: 0 })
    .rows.map((row) => row.id);
}

function act(actor: Actor, id: string) {
  return executeIntent(actor, {
    tool: "refunds",
    action: "execute",
    recordId: id,
    input: {},
    idempotencyKey: ulid(),
  });
}

describe("clustering_hold", () => {
  it("the refund that takes the merchant's not_received total over the manager line needs a manager", () => {
    const preview = execute(analyst, "rfnd_0013");
    expect(preview.decision.effect).toBe("require_approval");
    expect(preview.decision.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
    expect(hold("rfnd_0013")).toEqual({
      type: "require_approval",
      rule: "clustering_hold",
      tier: "manager",
      allowedRoles: ["manager"],
      reason: "Kestrel Outdoors $925 over $500 in 14 days",
    });
    expect(preview.routedTo).toEqual({
      tier: "manager",
      reason: "Kestrel Outdoors $925 over $500 in 14 days",
    });
  });

  it("the first refund under the line goes straight through", () => {
    expect(execute(analyst, "rfnd_0014").decision.effect).toBe("allow");
    expect(hold("rfnd_0014")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(queue("analyst")).toContain("rfnd_0014");
    expect(queue("manager")).not.toContain("rfnd_0014");
  });

  it("every later refund in the cluster needs a manager and leaves the analyst queue", () => {
    expect(hold("rfnd_0012")?.reason).toBe("Kestrel Outdoors $1,400 over $500 in 14 days");
    expect(hold("rfnd_0011")?.reason).toBe("Kestrel Outdoors $1,880 over $500 in 14 days");
    const analystRows = queue("analyst");
    const managerRows = queue("manager");
    for (const id of ["rfnd_0011", "rfnd_0012", "rfnd_0013"]) {
      expect(analystRows).not.toContain(id);
      expect(managerRows).toContain(id);
    }
  });

  it("clustering_hold sits right after amount_approval in the execute trace", () => {
    expect(execute(analyst, "rfnd_0011").decision.trace.map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "clustering_hold",
      "goodwill_approval",
    ]);
    expect(refundTool.ruleLabels?.clustering_hold).toBeDefined();
  });

  it("a refund with another reason code from the same merchant is not held", () => {
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
        requestedAt: Date.now() - HOUR,
        settledAt: null,
        lastNote: null,
        version: 1,
      })
      .run();
    try {
      expect(execute(analyst, "rfnd_test_faulty").decision.effect).toBe("allow");
      expect(hold("rfnd_test_faulty")).toEqual({ type: "allow", rule: "clustering_hold" });
      expect(hold("rfnd_0011")?.reason).toBe("Kestrel Outdoors $1,880 over $500 in 14 days");
    } finally {
      db.delete(refunds).where(eq(refunds.id, "rfnd_test_faulty")).run();
    }
  });

  it("rejected refunds do not count toward the running total", () => {
    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, "rfnd_0013")).run();
    try {
      expect(heldRefunds().has("rfnd_0013")).toBe(false);
      expect(hold("rfnd_0014")?.type).toBe("allow");
      expect(hold("rfnd_0012")?.reason).toBe("Kestrel Outdoors $940 over $500 in 14 days");
      expect(hold("rfnd_0011")?.reason).toBe("Kestrel Outdoors $1,420 over $500 in 14 days");
    } finally {
      db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, "rfnd_0013")).run();
    }
  });

  it("refunds outside the window do not count", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "3").ok).toBe(true);
    expect(hold("rfnd_0014")?.type).toBe("allow");
    expect(hold("rfnd_0013")?.type).toBe("allow");
    expect(hold("rfnd_0012")?.reason).toBe("Kestrel Outdoors $935 over $500 in 3 days");
    expect(hold("rfnd_0011")?.reason).toBe("Kestrel Outdoors $1,415 over $500 in 3 days");
  });

  it("with refunds.clustering_window_days at 0 clustering_hold reads allow and no refund is routed by it", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    expect(heldRefunds().size).toBe(0);
    const analystRows = queue("analyst");
    for (const id of ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"]) {
      expect(hold(id)).toEqual({ type: "allow", rule: "clustering_hold" });
      expect(execute(analyst, id).decision.effect).toBe("allow");
      expect(analystRows).toContain(id);
    }
  });

  it("a manager sends a held refund to the processor directly", () => {
    const pending = () =>
      listApprovals("pending").filter((a) => a.tool === "refunds" && a.recordId === "rfnd_0011");
    expect(execute(manager, "rfnd_0011")).toMatchObject({ offered: true, actsAsApprover: true });
    const result = act(manager, "rfnd_0011");
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0011")?.status).toBe("executing");
    expect(pending()).toEqual([]);

    const routed = act(analyst, "rfnd_0012");
    expect(routed.outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
      message: "Needs a manager: Kestrel Outdoors $1,400 over $500 in 14 days",
    });
    expect(refundTool.get("rfnd_0012")?.status).toBe("requested");
  });

  it("declares refunds.clustering_window_days with a 14-day default", () => {
    expect(refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY)).toMatchObject({
      value: 14,
      type: "number",
      tool: "refunds",
    });
    expect(clusteringWindowDays()).toBe(14);
  });
});
