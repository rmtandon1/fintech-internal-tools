import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, listApprovals } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import { rolesFor } from "@console/permissions";
import { kycTool } from "@console/tool-kyc";
import { kycCases } from "@console/tool-kyc/schema";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  setupHarness();
  registerConstants([...(kycTool.constants ?? []), ...(refundTool.constants ?? [])]);
  kycTool.seed?.();
  refundTool.seed?.();
  // Clean cases for Kestrel customers: nothing but the linked refund can route them.
  insertCase("kyc_test_gwen", "gwen.ashworth@example.com");
  insertCase("kyc_test_rasmus", "rasmus.lindgren@example.com");
  insertCase("kyc_test_ivo", "ivo.marchetti@example.com");
  window("14");
});

function window(days: string) {
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, days).ok).toBe(true);
}

function insertCase(id: string, email: string) {
  const now = Date.now();
  db.insert(kycCases)
    .values({
      id,
      customerName: `Customer ${id}`,
      email,
      dateOfBirth: "1990-01-01",
      documentType: "passport",
      documentNumber: "GB0000001",
      country: "GB",
      segment: "consumer",
      riskScore: 20,
      riskTier: "low",
      sanctionsHit: 0,
      pep: 0,
      documentsComplete: 1,
      status: "pending_review",
      openedAt: now - HOUR,
      dueAt: now + 24 * HOUR,
      lastNote: null,
      decidedBy: null,
      version: 1,
    })
    .run();
}

function approveDecision(id: string) {
  const record = kycTool.get(id);
  if (!record) throw new Error(`no kyc case ${id}`);
  const preview = previewActions(kycTool, record, analyst).find((p) => p.action === "approve");
  if (!preview?.decision) throw new Error(`no approve decision on ${id}`);
  return preview.decision;
}

function holdOf(id: string) {
  return approveDecision(id).trace.find((o) => o.rule === "linked_refund_hold");
}

describe("kyc linked refund hold", () => {
  it("sends a KYC approval to a manager when the customer has a refund held by clustering_hold, whatever the risk score", () => {
    const result = executeIntent(analyst, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_test_gwen",
      input: {},
      idempotencyKey: ulid(),
    });
    expect(result.outcome.status).toBe("pending_approval");
    if (result.outcome.status !== "pending_approval") throw new Error("expected pending approval");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        type: "require_approval",
        rule: "linked_refund_hold",
        tier: "manager",
        allowedRoles: rolesFor("kyc", "manager"),
      }),
    );
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    expect(
      result.outcome.trace.filter((o) => o.type === "require_approval").map((o) => o.rule),
    ).toEqual(["linked_refund_hold"]);
    expect(holdOf("kyc_0013")?.type).toBe("require_approval");
  });

  it("approves the customer straight through when the window is 0", () => {
    window("0");
    expect(approveDecision("kyc_test_rasmus").effect).toBe("allow");
    expect(holdOf("kyc_test_rasmus")).toEqual({ type: "allow", rule: "linked_refund_hold" });
    window("14");
    expect(approveDecision("kyc_test_rasmus").effect).toBe("require_approval");
  });

  it("approves the customer straight through when their refund is under the running limit or rejected", () => {
    expect(approveDecision("kyc_test_ivo").effect).toBe("allow");
    expect(holdOf("kyc_test_ivo")).toEqual({ type: "allow", rule: "linked_refund_hold" });

    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, "rfnd_0011")).run();
    expect(approveDecision("kyc_test_rasmus").effect).toBe("allow");
    db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, "rfnd_0011")).run();
    expect(approveDecision("kyc_test_rasmus").effect).toBe("require_approval");
  });

  it("lets a manager approve the held case", () => {
    const pending = listApprovals("pending").filter(
      (a) => a.tool === "kyc" && a.recordId === "kyc_test_gwen",
    );
    expect(pending).toHaveLength(1);
    const result = approve(manager, pending[0].id, "Reviewed the merchant pattern");
    expect(result.outcome.status).toBe("applied");
    expect(kycTool.get("kyc_test_gwen")?.status).toBe("approved");
  });

  it("names the refund and merchant but no customer PII in the linked_refund_hold reason", () => {
    const hold = holdOf("kyc_0013");
    if (hold?.type !== "require_approval") throw new Error("expected kyc_0013 to be held");
    expect(hold.reason).toContain("rfnd_0012 at Kestrel Outdoors");
    expect(hold.reason).not.toMatch(/@|noor|El-Amin|1276|NL3387455/i);
  });
});
