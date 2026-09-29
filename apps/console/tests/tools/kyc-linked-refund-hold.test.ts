import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import { kycTool } from "@console/tool-kyc";
import { kycCases } from "@console/tool-kyc/schema";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { admin, analyst, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
  // kyc_0001 and kyc_0002 are clean low-risk cases; give them Kestrel customers' emails.
  db.update(kycCases).set({ email: "rasmus.lindgren@example.com" }).where(eq(kycCases.id, "kyc_0001")).run();
  db.update(kycCases).set({ email: "ivo.marchetti@example.com" }).where(eq(kycCases.id, "kyc_0002")).run();
});

function approve(recordId: string) {
  return executeIntent(analyst, {
    tool: "kyc",
    action: "approve",
    recordId,
    input: {},
    idempotencyKey: ulid(),
  });
}

function approveTrace(recordId: string) {
  const record = kycTool.get(recordId);
  if (!record) throw new Error(`missing ${recordId}`);
  return previewActions(kycTool, record, analyst).find((p) => p.action === "approve")?.decision?.trace;
}

function setWindow(days: string) {
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, days).ok).toBe(true);
}

describe("kyc linked_refund_hold", () => {
  it("routes KYC approval for a customer with a held refund to a manager whatever the risk score", () => {
    setWindow("14");
    const trace = approveTrace("kyc_0001");
    expect(trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    expect(trace).toContainEqual(
      expect.objectContaining({
        type: "require_approval",
        rule: "linked_refund_hold",
        tier: "manager",
        allowedRoles: ["manager"],
      }),
    );

    const result = approve("kyc_0001");
    expect(result.outcome.status).toBe("pending_approval");
    expect(kycTool.get("kyc_0001")?.status).toBe("pending_review");

    expect(approveTrace("kyc_0013")).toContainEqual(
      expect.objectContaining({ type: "require_approval", rule: "linked_refund_hold" }),
    );
  });

  it("names linked_refund_hold in the KYC trace without the customer's email", () => {
    const hold = approveTrace("kyc_0001")?.find((o) => o.rule === "linked_refund_hold");
    expect(hold).toMatchObject({
      reason:
        'A refund from this customer is held: Kestrel Outdoors "not received" refunds reach $1,880 in 14 days, over the $500 manager limit',
    });
    expect(JSON.stringify(hold)).not.toMatch(/@example\.com|rasmus/i);
  });

  it("leaves customers with no held refund unaffected", () => {
    expect(approveTrace("kyc_0002")).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    expect(approveTrace("kyc_0008")).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
  });

  it("approves the same customer straight through with the window at 0", () => {
    db.update(kycCases).set({ email: "gwen.ashworth@example.com" }).where(eq(kycCases.id, "kyc_0002")).run();
    expect(approveTrace("kyc_0002")).toContainEqual(
      expect.objectContaining({ type: "require_approval", rule: "linked_refund_hold" }),
    );

    setWindow("0");
    expect(approveTrace("kyc_0002")).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    expect(approve("kyc_0002").outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0002")?.status).toBe("approved");
  });
});
