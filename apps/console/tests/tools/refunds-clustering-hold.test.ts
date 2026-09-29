import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor, PolicyDecision } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { kycTool } from "@console/tool-kyc";
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

const DAY = 24 * 60 * 60 * 1000;
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
});

function decisionFor(tool: "refunds" | "kyc", id: string, actor: Actor): PolicyDecision {
  const decl = tool === "refunds" ? refundTool : kycTool;
  const action = tool === "refunds" ? "execute" : "approve";
  const record = decl.get(id);
  if (!record) throw new Error(`missing ${id}`);
  const decision = previewActions(decl, record, actor).find((p) => p.action === action)?.decision;
  if (!decision) throw new Error(`no ${action} decision for ${id}`);
  return decision;
}

function holdOf(decision: PolicyDecision, rule: string) {
  const outcome = decision.trace.find((o) => o.rule === rule);
  if (!outcome) throw new Error(`${rule} missing from the trace`);
  return outcome;
}

let seq = 0;
function insertRefund(merchant: string, usdMinor: number, fields: Partial<typeof refunds.$inferInsert> = {}): string {
  seq += 1;
  const id = `rfnd_hold_${seq}`;
  db.insert(refunds)
    .values({
      id,
      paymentId: `pay_hold_${seq}`,
      customerEmail: `hold${seq}@example.com`,
      cardLast4: "4242",
      merchant,
      psp: "stripe",
      currency: "USD",
      capturedMinor: usdMinor,
      refundedMinor: 0,
      amountMinor: usdMinor,
      usdMinor,
      reasonCode: "not_received",
      disputed: 0,
      status: "requested",
      requestedBy: null,
      requestedAt: Date.now() - DAY,
      settledAt: null,
      lastNote: null,
      version: 1,
      ...fields,
    })
    .run();
  return id;
}

describe("refund clustering hold", () => {
  it("declares the clustering window constant at 14 days", () => {
    expect(refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY)).toMatchObject({
      value: 14,
      type: "number",
      tool: "refunds",
    });
  });

  it("sends every Kestrel not_received refund to a refunds manager once the merchant total passes the limit", () => {
    for (const id of KESTREL) {
      const decision = decisionFor("refunds", id, refundsAgent);
      expect(decision.effect).toBe("require_approval");
      expect(decision.tier).toBe("manager");
      expect(decision.allowedRoles).toEqual(rolesFor("refunds", "manager"));
      expect(decision.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
      expect(holdOf(decision, "clustering_hold")).toMatchObject({
        type: "require_approval",
        tier: "manager",
      });
    }
  });

  it("names the merchant, the running total, the window and the limit in the clustering_hold reason", () => {
    const hold = holdOf(decisionFor("refunds", "rfnd_0014", refundsAgent), "clustering_hold");
    expect(hold.type === "require_approval" && hold.reason).toBe(
      "4 refunds from Kestrel Outdoors add up to $1,880 in 14 days; $500 needs a manager",
    );
  });

  it("runs clustering_hold after the existing execute rules", () => {
    expect(decisionFor("refunds", "rfnd_0014", refundsAgent).trace.map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "goodwill_approval",
      "clustering_hold",
    ]);
  });

  it("leaves a refund outside every cluster to the existing rules", () => {
    const decision = decisionFor("refunds", "rfnd_0001", refundsAgent);
    expect(decision.effect).toBe("allow");
    expect(decision.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("holds a merchant total at exactly the manager limit and not one cent under it", () => {
    const exact = [insertRefund("Exact Line Co", 25_000), insertRefund("Exact Line Co", 25_000)];
    for (const id of exact) {
      expect(holdOf(decisionFor("refunds", id, refundsAgent), "clustering_hold").type).toBe(
        "require_approval",
      );
    }
    const under = [insertRefund("Just Under Co", 25_000), insertRefund("Just Under Co", 24_999)];
    for (const id of under) {
      expect(decisionFor("refunds", id, refundsAgent).effect).toBe("allow");
    }
  });

  it("counts only the merchant's not_received refunds inside the window that were not rejected", () => {
    const now = Date.now();
    const inWindow = insertRefund("Window Co", 30_000);
    insertRefund("Window Co", 30_000, { requestedAt: now - 20 * DAY });
    insertRefund("Window Co", 30_000, { reasonCode: "damaged" });
    insertRefund("Window Co", 30_000, { status: "rejected" });
    insertRefund("Other Merchant Co", 30_000);
    expect(holdOf(decisionFor("refunds", inWindow, refundsAgent), "clustering_hold").type).toBe(
      "allow",
    );

    const second = insertRefund("Window Co", 20_000);
    for (const id of [inWindow, second]) {
      expect(holdOf(decisionFor("refunds", id, refundsAgent), "clustering_hold").type).toBe(
        "require_approval",
      );
    }
  });

  it("stops holding the merchant once rejections bring its total under the limit", () => {
    const ids = [insertRefund("Rejecting Co", 30_000), insertRefund("Rejecting Co", 30_000)];
    expect(decisionFor("refunds", ids[0], refundsAgent).effect).toBe("require_approval");
    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, ids[1])).run();
    expect(decisionFor("refunds", ids[0], refundsAgent).effect).toBe("allow");
  });

  it("switches both holds off when the window is 0 and back on at 14", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    const refund = decisionFor("refunds", "rfnd_0013", refundsAgent);
    expect(refund.effect).toBe("allow");
    expect(refund.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOf(decisionFor("kyc", "kyc_0013", kycReviewer), "linked_refund_hold").type).toBe(
      "allow",
    );

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    expect(decisionFor("refunds", "rfnd_0013", refundsAgent).effect).toBe("require_approval");
  });

  it("parks a held refund until a refunds manager approves it", () => {
    const raised = executeIntent(refundsAgent, {
      tool: "refunds",
      action: "execute",
      recordId: "rfnd_0014",
      input: {},
      idempotencyKey: ulid(),
    });
    if (raised.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(refundTool.get("rfnd_0014")?.status).toBe("requested");
    const approval = getApproval(raised.outcome.approvalId);
    expect(approval?.tier).toBe("manager");

    expect(approve(kycManager, raised.outcome.approvalId, "not mine").outcome.status).not.toBe(
      "applied",
    );
    expect(approve(refundsManager, raised.outcome.approvalId, "checked").outcome.status).toBe(
      "applied",
    );
    expect(refundTool.get("rfnd_0014")?.status).toBe("executing");
  });

  it("keeps the merchant, the refund ids and emails out of the linked_refund_hold reason", () => {
    const reason = decisionFor("kyc", "kyc_0013", kycReviewer).trace.find(
      (o) => o.rule === "linked_refund_hold",
    );
    const text = JSON.stringify(reason);
    expect(text).not.toContain("Kestrel");
    expect(text).not.toContain("rfnd_");
    expect(text).not.toContain("@");
  });

  it("sends a KYC approval to a KYC manager when the customer has a refund in a held cluster", () => {
    const decision = decisionFor("kyc", "kyc_0013", kycReviewer);
    expect(decision.effect).toBe("require_approval");
    expect(decision.tier).toBe("manager");
    expect(decision.allowedRoles).toEqual(rolesFor("kyc", "manager"));
    expect(decision.trace.filter((o) => o.type !== "allow").map((o) => o.rule)).toEqual([
      "linked_refund_hold",
    ]);
    expect(decision.trace.at(-1)?.rule).toBe("linked_refund_hold");

    const raised = executeIntent(kycReviewer, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0013",
      input: {},
      idempotencyKey: ulid(),
    });
    if (raised.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");
    expect(approve(kycManager, raised.outcome.approvalId, "checked").outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0013")?.status).toBe("approved");
  });

  it("does not hold a KYC approval for a customer whose refunds are in no held cluster", () => {
    for (const id of ["kyc_0008", "kyc_0001"]) {
      expect(holdOf(decisionFor("kyc", id, kycReviewer), "linked_refund_hold")).toEqual({
        type: "allow",
        rule: "linked_refund_hold",
      });
    }
  });
});
