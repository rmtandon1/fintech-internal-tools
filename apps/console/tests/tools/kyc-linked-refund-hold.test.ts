import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { approve as approveRequest, listApprovals } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { kycTool } from "@console/tool-kyc";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  registerConstants([...(kycTool.constants ?? []), ...(refundTool.constants ?? [])]);
  kycTool.seed?.();
  refundTool.seed?.();
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
});

afterEach(() => {
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
});

function approve(actor: Actor, id: string) {
  const record = kycTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  const preview = previewActions(kycTool, record, actor).find((p) => p.action === "approve");
  if (!preview?.decision) throw new Error(`no approve decision for ${id}`);
  return { ...preview, decision: preview.decision };
}

describe("linked_refund_hold", () => {
  it("approving a case whose customer has a held refund needs a manager whatever the risk score", () => {
    const record = kycTool.get("kyc_0013");
    expect(Number(record?.riskScore)).toBeLessThan(70);
    const preview = approve(analyst, "kyc_0013");
    expect(preview.decision.effect).toBe("require_approval");
    expect(preview.decision.trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    expect(preview.decision.trace.filter((o) => o.type !== "allow")).toEqual([
      {
        type: "require_approval",
        rule: "linked_refund_hold",
        tier: "manager",
        allowedRoles: ["manager"],
        reason: "Customer has a refund held for a manager in the Kestrel Outdoors not_received cluster",
      },
    ]);
    expect(JSON.stringify(preview.decision.trace)).not.toMatch(/@example\.com/);
  });

  it("a case whose customer has no held refund is not held by linked_refund_hold", () => {
    for (const id of ["kyc_0001", "kyc_0002"]) {
      expect(approve(analyst, id).decision.trace).toContainEqual({
        type: "allow",
        rule: "linked_refund_hold",
      });
    }
    expect(approve(analyst, "kyc_0001").decision.effect).toBe("allow");
  });

  it("with the window at 0 linked_refund_hold reads allow", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    const preview = approve(analyst, "kyc_0013");
    expect(preview.decision.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    expect(preview.decision.effect).toBe("allow");
  });

  it("a KYC manager approves a linked case directly", () => {
    const requested = executeIntent(analyst, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0013",
      input: {},
      idempotencyKey: ulid(),
    });
    if (requested.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(requested.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "linked_refund_hold", allowedRoles: ["manager"] }),
    );
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");

    const result = approveRequest(manager, requested.outcome.approvalId, "Refund cluster reviewed");
    expect(result.outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0013")?.status).toBe("approved");
    expect(
      listApprovals("pending").filter((a) => a.tool === "kyc" && a.recordId === "kyc_0013"),
    ).toEqual([]);
  });
});
