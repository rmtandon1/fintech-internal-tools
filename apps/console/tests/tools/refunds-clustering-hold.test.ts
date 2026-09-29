import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, canDecide, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor, IntentOutcome } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { kycTool } from "@console/tool-kyc";
import { CLUSTERING_WINDOW_DAYS_KEY, heldClusterFor, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsAgent,
  refundsManager,
  setupHarness,
} from "../helpers/harness";

const HOUR = 60 * 60 * 1000;
const NOOR = "noor.el-amin@example.com";

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
});

afterEach(() => {
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
});

function act(actor: Actor, tool: string, action: string, recordId: string) {
  return executeIntent(actor, { tool, action, recordId, input: {}, idempotencyKey: ulid() });
}

function traceOf(outcome: IntentOutcome) {
  if (!("trace" in outcome) || !outcome.trace) throw new Error("outcome has no trace");
  return outcome.trace;
}

function previewExecute(id: string) {
  const record = refundTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  const preview = previewActions(refundTool, record, refundsAgent).find((p) => p.action === "execute");
  if (!preview?.decision) throw new Error(`no execute decision for ${id}`);
  return preview.decision;
}

function holdOf(id: string) {
  return previewExecute(id).trace.find((o) => o.rule === "clustering_hold");
}

function addRefund(
  id: string,
  merchant: string,
  usdMinor: number,
  hoursAgo: number,
  { reasonCode = "not_received", status = "requested" }: { reasonCode?: string; status?: string } = {},
): void {
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
      reasonCode,
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
  it("declares refunds.clustering_window_days at 14 and registers clustering_hold last on execute", () => {
    expect(refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY)).toMatchObject({
      value: 14,
      type: "number",
      tool: "refunds",
    });
    expect(previewExecute("rfnd_0011").trace.map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "goodwill_approval",
      "clustering_hold",
    ]);
  });

  it("the refund that takes a merchant's not_received total over the manager line goes to a refunds manager", () => {
    // rfnd_0014 (46,500) then rfnd_0013 (46,000): 92,500 passes the 50,000 line.
    const result = act(refundsAgent, "refunds", "execute", "rfnd_0013");
    expect(result.outcome.status).toBe("pending_approval");
    const trace = traceOf(result.outcome);
    expect(trace).toContainEqual({ type: "allow", rule: "amount_approval" });
    expect(trace.filter((o) => o.type !== "allow")).toEqual([
      expect.objectContaining({
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
      }),
    ]);
    expect(refundTool.get("rfnd_0013")?.status).toBe("requested");
  });

  it("the trace names clustering_hold, the merchant and the running total", () => {
    expect(holdOf("rfnd_0013")).toMatchObject({
      type: "require_approval",
      reason: "Kestrel Outdoors's not-received refunds add up to $925 over 14 days, past the $500 manager limit",
    });
    expect(holdOf("rfnd_0012")).toMatchObject({
      type: "require_approval",
      reason: expect.stringContaining("add up to $1,400 over 14 days"),
    });
    expect(holdOf("rfnd_0011")).toMatchObject({
      type: "require_approval",
      reason: expect.stringMatching(/^Kestrel Outdoors's .*\$1,880 over 14 days/),
    });
  });

  it("refunds before the running total reaches the line are paid automatically", () => {
    expect(holdOf("rfnd_0014")).toEqual({ type: "allow", rule: "clustering_hold" });
    const result = act(refundsAgent, "refunds", "execute", "rfnd_0014");
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0014")?.status).toBe("executing");
    // Paid refunds still count toward the total for the rest of the window.
    expect(holdOf("rfnd_0011")?.type).toBe("require_approval");
  });

  it("refunds outside the window do not count toward the running total", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "1").ok).toBe(true);
    // Only rfnd_0011 (8h ago, 48,000) is inside one day.
    expect(holdOf("rfnd_0011")).toEqual({ type: "allow", rule: "clustering_hold" });
    // rfnd_0012 is 27h ago: outside a one-day window, so it is not held either.
    expect(holdOf("rfnd_0012")).toEqual({ type: "allow", rule: "clustering_hold" });

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "3").ok).toBe(true);
    // rfnd_0013 (55h) opens the three-day window alone; rfnd_0012 takes it to 93,500.
    expect(holdOf("rfnd_0013")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOf("rfnd_0012")).toMatchObject({
      type: "require_approval",
      reason: expect.stringContaining("$935 over 3 days"),
    });
  });

  it("rejected refunds and other reason codes do not count toward the running total", () => {
    addRefund("rfnd_hold_a1", "Hold Test A", 30_000, 48, { status: "rejected" });
    addRefund("rfnd_hold_a2", "Hold Test A", 30_000, 36, { reasonCode: "faulty" });
    addRefund("rfnd_hold_a3", "Hold Test A", 30_000, 24);
    expect(holdOf("rfnd_hold_a2")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOf("rfnd_hold_a3")).toEqual({ type: "allow", rule: "clustering_hold" });

    addRefund("rfnd_hold_a4", "Hold Test A", 25_000, 12);
    expect(holdOf("rfnd_hold_a4")).toMatchObject({
      type: "require_approval",
      reason: expect.stringContaining("add up to $550"),
    });
  });

  it("the running total is per merchant", () => {
    addRefund("rfnd_hold_b1", "Hold Test B", 40_000, 2);
    expect(holdOf("rfnd_hold_b1")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(previewExecute("rfnd_hold_b1").effect).toBe("allow");
  });

  it("a refunds manager approves a held refund and the requesting agent cannot", () => {
    const raised = act(refundsAgent, "refunds", "execute", "rfnd_0012");
    if (raised.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    const approval = getApproval(raised.outcome.approvalId);
    if (!approval) throw new Error("approval request missing");
    expect(approval.allowedRoles).toEqual(rolesFor("refunds", "manager"));
    expect(canDecide(approval, kycManager).ok).toBe(false);
    expect(approve(refundsAgent, approval.id).outcome.status).toBe("error");

    expect(approve(refundsManager, approval.id).outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0012")?.status).toBe("executing");
  });

  it("a window of 0 turns the refund hold off", () => {
    expect(holdOf("rfnd_0011")?.type).toBe("require_approval");
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    expect(holdOf("rfnd_0011")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(previewExecute("rfnd_0011").effect).toBe("allow");
  });
});

describe("kyc linked refund hold", () => {
  it("approving a case whose email matches a customer in a held cluster needs a KYC manager whatever the risk score", () => {
    const record = kycTool.get("kyc_0013");
    expect(record?.email).toBe(NOOR);
    expect(record?.riskScore).toBeLessThan(70);
    expect(heldClusterFor(NOOR)).toMatchObject({ count: 4, totalUsdMinor: 188_000, windowDays: 14 });

    const result = act(kycReviewer, "kyc", "approve", "kyc_0013");
    expect(result.outcome.status).toBe("pending_approval");
    const trace = traceOf(result.outcome);
    expect(trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    expect(trace.filter((o) => o.type !== "allow")).toEqual([
      expect.objectContaining({
        type: "require_approval",
        rule: "linked_refund_hold",
        tier: "manager",
        allowedRoles: rolesFor("kyc", "manager"),
      }),
    ]);
    expect(JSON.stringify(trace)).not.toContain("Kestrel Outdoors");
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");

    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    const approval = getApproval(result.outcome.approvalId);
    if (!approval) throw new Error("approval request missing");
    expect(canDecide(approval, refundsManager).ok).toBe(false);
    expect(approve(kycManager, approval.id).outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0013")?.status).toBe("approved");
  });

  it("a case with no customer in a held cluster approves without linked_refund_hold", () => {
    const record = kycTool.get("kyc_0001");
    if (!record) throw new Error("missing kyc_0001");
    expect(heldClusterFor(record.email)).toBeNull();
    const result = act(kycReviewer, "kyc", "approve", "kyc_0001");
    expect(result.outcome.status).toBe("applied");
    expect(traceOf(result.outcome)).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
  });

  it("a window of 0 turns the linked KYC hold off", () => {
    expect(heldClusterFor(NOOR)).not.toBeNull();
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    expect(heldClusterFor(NOOR)).toBeNull();
  });
});
