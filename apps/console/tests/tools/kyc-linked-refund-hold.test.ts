import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, canDecide, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { PolicyDecision } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { kycTool } from "@console/tool-kyc";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, kycManager, kycReviewer, refundsManager, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  registerConstants([...(kycTool.constants ?? []), ...(refundTool.constants ?? [])]);
  kycTool.seed?.();
  refundTool.seed?.();
});

function approveDecision(caseId: string): PolicyDecision {
  const record = kycTool.get(caseId);
  if (!record) throw new Error(`missing ${caseId}`);
  const preview = previewActions(kycTool, record, kycReviewer).find((p) => p.action === "approve");
  if (!preview?.decision) throw new Error(`no approve decision for ${caseId}`);
  return preview.decision;
}

function requestApproval(caseId: string) {
  return executeIntent(kycReviewer, {
    tool: "kyc",
    action: "approve",
    recordId: caseId,
    input: {},
    idempotencyKey: ulid(),
  });
}

describe("kyc linked refund hold", () => {
  it("leaves a case whose customer has no held refunds unchanged: score 68 still clears", () => {
    expect(kycTool.get("kyc_0013")?.riskScore).toBe(68);
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    try {
      const decision = approveDecision("kyc_0013");
      expect(decision.effect).toBe("allow");
      expect(decision.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    } finally {
      expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    }
    for (const caseId of ["kyc_0002", "kyc_0006", "kyc_0010"]) {
      expect(approveDecision(caseId).trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    }
  });

  it("releases the KYC hold when the customer's held refund is rejected", () => {
    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, "rfnd_0012")).run();
    try {
      expect(approveDecision("kyc_0013").trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    } finally {
      db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, "rfnd_0012")).run();
    }
  });

  it("sends approval of a case whose customer has a held refund to a KYC manager, whatever the risk score", () => {
    const result = requestApproval("kyc_0013");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        type: "require_approval",
        rule: "linked_refund_hold",
        tier: "manager",
        allowedRoles: rolesFor("kyc", "manager"),
      }),
    );
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");
  });

  it("names no merchant, refund or customer detail in the linked_refund_hold reason", () => {
    const outcome = approveDecision("kyc_0013").trace.find((o) => o.rule === "linked_refund_hold");
    if (outcome?.type !== "require_approval") throw new Error("expected a hold");
    expect(outcome.reason).toBe("1 of this customer's refunds is held for a manager by the clustering hold");
    expect(outcome.reason).not.toMatch(/Kestrel|rfnd_|@|1276/);
  });

  it("lets a KYC manager approve the held case and not a refunds manager", () => {
    const result = requestApproval("kyc_0013");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    const approval = getApproval(result.outcome.approvalId);
    if (!approval) throw new Error("approval not recorded");
    expect(canDecide(approval, refundsManager).ok).toBe(false);
    expect(canDecide(approval, kycManager).ok).toBe(true);
    expect(approve(kycManager, approval.id).outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0013")?.status).toBe("approved");
  });
});
