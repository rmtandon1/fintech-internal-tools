import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import { kycTool } from "@console/tool-kyc";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, analyst, setupHarness } from "../helpers/harness";

// kyc_0013 (risk 68, under the 70 manager score) is the customer behind
// rfnd_0012, the third seeded Kestrel "not received" refund: $1,400 running
// total, over the $500 manager limit once the hold is on.

beforeAll(() => {
  setupHarness();
  registerConstants([...(kycTool.constants ?? []), ...(refundTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
});

function approvePreview(caseId: string) {
  const record = kycTool.get(caseId);
  if (!record) throw new Error(`missing ${caseId}`);
  return previewActions(kycTool, record, analyst).find((p) => p.action === "approve")?.decision;
}

describe("kyc linked refund hold", () => {
  it("leaves a case whose customer has no held refunds unchanged: score 68 still clears", () => {
    expect(kycTool.get("kyc_0013")?.riskScore).toBe(68);

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    const off = approvePreview("kyc_0013");
    expect(off?.effect).toBe("allow");
    expect(off?.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, "rfnd_0012")).run();
    try {
      const noHeld = approvePreview("kyc_0013");
      expect(noHeld?.effect).toBe("allow");
      expect(noHeld?.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    } finally {
      db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, "rfnd_0012")).run();
    }
  });

  it("sends approval of a customer in a held cluster to a manager, whatever the risk score", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    const result = executeIntent(analyst, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0013",
      input: {},
      idempotencyKey: ulid(),
    });
    if (result.outcome.status !== "pending_approval") {
      throw new Error(`expected an approval request, got ${result.outcome.status}`);
    }
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    const hold = result.outcome.trace.find((o) => o.rule === "linked_refund_hold");
    expect(hold).toMatchObject({ type: "require_approval", tier: "manager", allowedRoles: ["manager"] });
    const reason = hold && "reason" in hold ? hold.reason : "";
    expect(reason).toContain('Kestrel Outdoors "not received" refunds reach $1,400');
    expect(reason).not.toMatch(/@|Noor|El-Amin/);
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");
  });
});
