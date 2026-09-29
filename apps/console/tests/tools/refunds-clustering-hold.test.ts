import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { canDecide, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { RuleOutcome } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, kycManager, refundsAgent, refundsManager, setupHarness } from "../helpers/harness";

const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

function execute(recordId: string) {
  return executeIntent(refundsAgent, {
    tool: "refunds",
    action: "execute",
    recordId,
    input: {},
    idempotencyKey: ulid(),
  });
}

function previewTrace(recordId: string): RuleOutcome[] {
  const record = refundTool.get(recordId);
  if (!record) throw new Error(`missing ${recordId}`);
  const preview = previewActions(refundTool, record, refundsAgent).find((p) => p.action === "execute");
  if (!preview?.decision) throw new Error(`no execute decision for ${recordId}`);
  return preview.decision.trace;
}

function hold(recordId: string): RuleOutcome | undefined {
  return previewTrace(recordId).find((o) => o.rule === "clustering_hold");
}

function insertRefund(id: string, merchant: string, usdMinor: number, hoursAgo: number, status = "requested") {
  db.insert(refunds)
    .values({
      id,
      paymentId: `pay_${id}`,
      customerEmail: `${id}@example.com`,
      cardLast4: "0001",
      merchant,
      psp: "stripe",
      currency: "USD",
      capturedMinor: usdMinor,
      refundedMinor: 0,
      amountMinor: usdMinor,
      usdMinor,
      reasonCode: "not_received",
      disputed: 0,
      status,
      requestedBy: null,
      requestedAt: Date.now() - hoursAgo * HOUR,
      settledAt: null,
      lastNote: null,
      version: 1,
    })
    .run();
}

describe("refunds clustering hold", () => {
  it("applies the first Kestrel not_received refund while the running total is under the manager line", () => {
    const result = execute("rfnd_0014");
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0014")?.status).toBe("executing");
    if (!("trace" in result.outcome) || !result.outcome.trace) throw new Error("no trace");
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("sends the refund that takes Kestrel's not_received total over the manager line to a refunds manager, naming the merchant and running total", () => {
    const result = execute("rfnd_0013");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(result.outcome.trace).toContainEqual({
      type: "require_approval",
      rule: "clustering_hold",
      tier: "manager",
      allowedRoles: rolesFor("refunds", "manager"),
      reason: "Kestrel Outdoors $925 over $500 in 14 days",
    });
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
    expect(refundTool.get("rfnd_0013")?.status).toBe("requested");

    const approval = getApproval(result.outcome.approvalId);
    if (!approval) throw new Error("approval not recorded");
    expect(approval.tier).toBe("manager");
    expect(canDecide(approval, refundsManager).ok).toBe(true);
    expect(canDecide(approval, kycManager).ok).toBe(false);
  });

  it("holds every later Kestrel not_received refund in the window too", () => {
    const reasons: Record<string, string> = {
      rfnd_0012: "Kestrel Outdoors $1,400 over $500 in 14 days",
      rfnd_0011: "Kestrel Outdoors $1,880 over $500 in 14 days",
    };
    for (const [id, reason] of Object.entries(reasons)) {
      const result = execute(id);
      if (result.outcome.status !== "pending_approval") throw new Error(`expected ${id} to be held`);
      expect(result.outcome.trace).toContainEqual(
        expect.objectContaining({ rule: "clustering_hold", tier: "manager", reason }),
      );
      expect(refundTool.get(id)?.status).toBe("requested");
    }
  });

  it("leaves a faulty refund from the same merchant alone", () => {
    const record = refundTool.get("rfnd_0002");
    expect(record?.merchant).toBe("Kestrel Outdoors");
    expect(record?.reasonCode).toBe("faulty");
    expect(hold("rfnd_0002")).toEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("does not count rejected refunds toward the running total", () => {
    insertRefund("rfnd_hold_pine_1", "Pine Ridge Supply", 30_000, 30, "rejected");
    insertRefund("rfnd_hold_pine_2", "Pine Ridge Supply", 25_000, 10);
    expect(hold("rfnd_hold_pine_2")).toEqual({ type: "allow", rule: "clustering_hold" });

    db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, "rfnd_hold_pine_1")).run();
    expect(hold("rfnd_hold_pine_2")).toMatchObject({
      type: "require_approval",
      reason: "Pine Ridge Supply $550 over $500 in 14 days",
    });
    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, "rfnd_hold_pine_1")).run();
  });

  it("holds nothing when refunds.clustering_window_days is 0", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    try {
      for (const id of ["rfnd_0011", "rfnd_0012", "rfnd_0013"]) {
        expect(hold(id)).toEqual({ type: "allow", rule: "clustering_hold" });
      }
    } finally {
      expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    }
    expect(hold("rfnd_0011")).toMatchObject({ type: "require_approval" });
  });

  it("only counts refunds inside the window", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "1").ok).toBe(true);
    try {
      expect(hold("rfnd_0011")).toEqual({ type: "allow", rule: "clustering_hold" });
      expect(hold("rfnd_0013")).toEqual({ type: "allow", rule: "clustering_hold" });
    } finally {
      expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    }
  });

  it("leaves a refund over the manager line on its own to amount_approval and out of the running total", () => {
    insertRefund("rfnd_hold_elm_big", "Elm Street Goods", 90_000, 20);
    insertRefund("rfnd_hold_elm_small", "Elm Street Goods", 10_000, 5);
    const bigTrace = previewTrace("rfnd_hold_elm_big");
    expect(bigTrace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    expect(bigTrace).toContainEqual(
      expect.objectContaining({ rule: "amount_approval", type: "require_approval", tier: "manager" }),
    );
    expect(hold("rfnd_hold_elm_small")).toEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("runs clustering_hold last on execute and declares the 14-day window constant", () => {
    expect(previewTrace("rfnd_0001").map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "goodwill_approval",
      "clustering_hold",
    ]);
    expect(refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY)).toMatchObject({
      value: 14,
      type: "number",
      tool: "refunds",
    });
    expect(refundTool.ruleLabels?.clustering_hold).toBeDefined();
  });
});
