import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approvalRequests } from "@console/db-core/engine-schema";
import { canDecide, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { kycTool } from "@console/tool-kyc";
import { kycCases } from "@console/tool-kyc/schema";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsAgent,
  refundsManager,
  setupHarness,
} from "../helpers/harness";

beforeAll(setupHarness);

beforeEach(() => {
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
  db.delete(approvalRequests).run();
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
});

function act(actor: Actor, tool: string, recordId: string) {
  return executeIntent(actor, {
    tool,
    action: tool === "refunds" ? "execute" : "approve",
    recordId,
    input: {},
    idempotencyKey: ulid(),
  });
}

function linkCaseToRefund(refundId: string): void {
  const email = db.select({ email: refunds.customerEmail })
    .from(refunds)
    .where(eq(refunds.id, refundId))
    .get()?.email;
  if (!email) throw new Error(`missing refund ${refundId}`);
  db.update(kycCases)
    .set({ email, riskScore: 68 })
    .where(eq(kycCases.id, "kyc_0002"))
    .run();
}

describe("merchant not-received clustering hold", () => {
  it("the first eligible refund under the merchant limit is applied", () => {
    const first = act(refundsAgent, "refunds", "rfnd_0014");
    expect(first.outcome.status).toBe("applied");
    if (first.outcome.status !== "applied") throw new Error("expected an applied refund");
    expect(first.outcome.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    expect(refundTool.get("rfnd_0014")?.status).toBe("executing");
  });

  it("the refund crossing the rolling manager limit requests manager approval with a trace total", () => {
    const crossing = act(refundsAgent, "refunds", "rfnd_0013");
    expect(crossing.outcome.status).toBe("pending_approval");
    if (crossing.outcome.status !== "pending_approval") throw new Error("expected a hold");
    expect(crossing.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "clustering_hold",
        type: "require_approval",
        tier: "manager",
        allowedRoles: ["refunds_manager", "admin"],
        reason: expect.stringContaining("Kestrel Outdoors not_received refunds total 92500"),
      }),
    );
    expect(refundTool.get("rfnd_0013")?.status).toBe("requested");

    db.update(refunds).set({ usdMinor: 4_000 }).where(eq(refunds.id, "rfnd_0014")).run();
    db.update(refunds).set({ usdMinor: 46_000 }).where(eq(refunds.id, "rfnd_0013")).run();
    const exact = act(refundsAgent, "refunds", "rfnd_0013");
    expect(exact.outcome.status).toBe("applied");
  });

  it("subsequent refunds from the same merchant remain held", () => {
    for (const [id, total] of [
      ["rfnd_0012", 140_000],
      ["rfnd_0011", 188_000],
    ] as const) {
      const result = act(refundsAgent, "refunds", id);
      expect(result.outcome.status).toBe("pending_approval");
      if (result.outcome.status !== "pending_approval") throw new Error("expected a hold");
      expect(result.outcome.trace).toContainEqual(
        expect.objectContaining({
          rule: "clustering_hold",
          reason: expect.stringContaining(String(total)),
        }),
      );
    }
  });

  it("faulty refunds and rejected not_received refunds do not contribute to the hold", () => {
    expect(act(refundsAgent, "refunds", "rfnd_0009").outcome.status).toBe("applied");
    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, "rfnd_0014")).run();
    const next = act(refundsAgent, "refunds", "rfnd_0013");
    expect(next.outcome.status).toBe("applied");
    const crossing = act(refundsAgent, "refunds", "rfnd_0012");
    expect(crossing.outcome.status).toBe("pending_approval");
  });

  it("a zero window disables the refund and linked KYC holds", () => {
    act(refundsAgent, "refunds", "rfnd_0013");
    linkCaseToRefund("rfnd_0014");
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    const refund = act(refundsAgent, "refunds", "rfnd_0012");
    expect(refund.outcome.status).toBe("applied");
    const caseResult = act(kycReviewer, "kyc", "kyc_0002");
    expect(caseResult.outcome.status).toBe("applied");

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "1").ok).toBe(true);
    const recentOnly = act(refundsAgent, "refunds", "rfnd_0011");
    expect(recentOnly.outcome.status).toBe("applied");
  });

  it("held cluster customers need KYC manager approval even below the risk score", () => {
    const held = act(refundsAgent, "refunds", "rfnd_0013");
    expect(held.outcome.status).toBe("pending_approval");
    linkCaseToRefund("rfnd_0014");
    const result = act(kycReviewer, "kyc", "kyc_0002");
    expect(result.outcome.status).toBe("pending_approval");
    if (result.outcome.status !== "pending_approval") throw new Error("expected a KYC hold");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "linked_refund_hold",
        type: "require_approval",
        tier: "manager",
        allowedRoles: ["kyc_manager", "admin"],
      }),
    );
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
  });

  it("customers outside held clusters still clear KYC at score 68", () => {
    act(refundsAgent, "refunds", "rfnd_0013");
    db.update(kycCases).set({ riskScore: 68 }).where(eq(kycCases.id, "kyc_0002")).run();
    const result = act(kycReviewer, "kyc", "kyc_0002");
    expect(result.outcome.status).toBe("applied");
    if (result.outcome.status !== "applied") throw new Error("expected KYC approval");
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
  });

  it("the refund and KYC approval requests are decidable only by their domain managers", () => {
    const refund = act(refundsAgent, "refunds", "rfnd_0013");
    linkCaseToRefund("rfnd_0013");
    const kyc = act(kycReviewer, "kyc", "kyc_0002");
    if (refund.outcome.status !== "pending_approval" || kyc.outcome.status !== "pending_approval") {
      throw new Error("expected both approval requests");
    }
    const refundApproval = getApproval(refund.outcome.approvalId);
    const kycApproval = getApproval(kyc.outcome.approvalId);
    if (!refundApproval || !kycApproval) throw new Error("missing approval requests");
    expect(canDecide(refundApproval, refundsManager).ok).toBe(true);
    expect(canDecide(refundApproval, kycManager).ok).toBe(false);
    expect(canDecide(kycApproval, kycManager).ok).toBe(true);
    expect(canDecide(kycApproval, refundsManager).ok).toBe(false);
  });
});
