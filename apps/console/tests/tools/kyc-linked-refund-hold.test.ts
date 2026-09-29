import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { PolicyDecision } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { kycTool } from "@console/tool-kyc";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, kycManager, kycReviewer, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  registerConstants(kycTool.constants ?? []);
  refundTool.seed?.();
  kycTool.seed?.();
});

function decision(id: string): PolicyDecision {
  const record = kycTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  const preview = previewActions(kycTool, record, kycReviewer).find((p) => p.action === "approve");
  if (!preview?.decision) throw new Error(`no approve decision for ${id}`);
  return preview.decision;
}

function linkedHold(id: string) {
  return decision(id).trace.find((o) => o.rule === "linked_refund_hold");
}

describe("kyc linked refund hold", () => {
  it("places linked_refund_hold last on approve and keeps the admin risk tier ahead of it", () => {
    expect(decision("kyc_0013").trace.map((o) => o.rule)).toEqual([
      "documents_complete",
      "no_sanctions_hit",
      "country_permitted",
      "risk_tier_approval",
      "pep_approval",
      "declared_vs_found",
      "escalated_needs_manager",
      "linked_refund_hold",
    ]);

    const email = "adaeze.okonkwo@example.com";
    expect(kycTool.get("kyc_0004")?.email).toBe(email);
    db.insert(refunds)
      .values({
        id: "rfnd_link_admin",
        paymentId: "pay_link_admin",
        customerEmail: email,
        cardLast4: "4242",
        merchant: "Kestrel Outdoors",
        psp: "stripe",
        currency: "USD",
        capturedMinor: 10_000,
        refundedMinor: 0,
        amountMinor: 10_000,
        usdMinor: 10_000,
        reasonCode: "not_received",
        disputed: 0,
        status: "requested",
        requestedBy: null,
        requestedAt: Date.now(),
        settledAt: null,
        lastNote: null,
        version: 1,
      })
      .run();
    const d = decision("kyc_0004");
    expect(d.effect).toBe("require_approval");
    expect(d.tier).toBe("admin");
    expect(linkedHold("kyc_0004")).toMatchObject({ type: "require_approval", tier: "manager" });
  });

  it("approves straight through when the customer's refunds are not in a held cluster", () => {
    expect(linkedHold("kyc_0002")).toEqual({ type: "allow", rule: "linked_refund_hold" });
    const result = executeIntent(kycReviewer, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0001",
      input: {},
      idempotencyKey: ulid(),
    });
    expect(result.outcome.status).toBe("applied");
    if (result.outcome.status !== "applied") return;
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
  });

  it("switches the linked hold off when refunds.clustering_window_days is 0", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    expect(linkedHold("kyc_0013")).toEqual({ type: "allow", rule: "linked_refund_hold" });
    expect(decision("kyc_0013").effect).toBe("allow");
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    expect(decision("kyc_0013").effect).toBe("require_approval");
  });

  it("sends a KYC approval to a KYC manager when the customer has a refund in a held merchant cluster", () => {
    const result = executeIntent(kycReviewer, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0013",
      input: {},
      idempotencyKey: ulid(),
    });
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(result.outcome.trace).toContainEqual({
      type: "require_approval",
      rule: "linked_refund_hold",
      tier: "manager",
      allowedRoles: rolesFor("kyc", "manager"),
      reason:
        'Customer has a "not received" refund from Kestrel Outdoors, whose refunds add up to $1,980 and are held for a manager',
    });
    for (const o of result.outcome.trace.filter((t) => t.rule !== "linked_refund_hold")) {
      expect(o.type).toBe("allow");
    }
    const approval = getApproval(result.outcome.approvalId);
    expect(approval?.tier).toBe("manager");
    expect(approval?.allowedRoles).toEqual(rolesFor("kyc", "manager"));
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");

    expect(approve(kycManager, result.outcome.approvalId).outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0013")?.status).toBe("approved");
  });
});
