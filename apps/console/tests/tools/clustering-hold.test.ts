import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor, RuleOutcome, ToolDeclaration } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { kycCases } from "@console/tool-kyc/schema";
import { kycTool } from "@console/tool-kyc";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import {
  admin,
  kycReviewer,
  refundsAgent,
  refundsManager,
  setupHarness,
} from "../helpers/harness";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];

beforeAll(() => {
  setupHarness();
  registerConstants([
    ...(kycTool.constants ?? []),
    ...(refundTool.constants ?? []),
    {
      key: CLUSTERING_WINDOW_DAYS_KEY,
      value: 14,
      type: "number",
      description: "Days of refunds a cluster looks back over",
      tool: "refunds",
    },
  ]);
  kycTool.seed?.();
  refundTool.seed?.();
});

function insertRefund(
  id: string,
  merchant: string,
  usdMinor: number,
  opts: { reasonCode?: string; status?: string; ageMs?: number; email?: string } = {},
): void {
  db.insert(refunds)
    .values({
      id,
      paymentId: `pay_${id}`,
      customerEmail: opts.email ?? `${id}@example.com`,
      cardLast4: "0001",
      merchant,
      psp: "stripe",
      currency: "USD",
      capturedMinor: usdMinor,
      refundedMinor: 0,
      amountMinor: usdMinor,
      usdMinor,
      reasonCode: opts.reasonCode ?? "not_received",
      disputed: 0,
      status: opts.status ?? "requested",
      requestedBy: null,
      requestedAt: Date.now() - (opts.ageMs ?? HOUR),
      settledAt: null,
      lastNote: null,
      version: 1,
    })
    .run();
}

function preview(
  decl: ToolDeclaration,
  action: string,
  id: string,
  actor: Actor,
) {
  const record = decl.get(id);
  if (!record) throw new Error(`missing ${id}`);
  const decision = previewActions(decl, record, actor).find((p) => p.action === action)?.decision;
  if (!decision) throw new Error(`no ${action} decision for ${id}`);
  return decision;
}

const refundDecision = (id: string) => preview(refundTool, "execute", id, refundsAgent);
const kycDecision = (id: string) => preview(kycTool, "approve", id, kycReviewer);

function ruleOf(trace: RuleOutcome[], rule: string): RuleOutcome {
  const outcome = trace.find((o) => o.rule === rule);
  if (!outcome) throw new Error(`no ${rule} in trace`);
  return outcome;
}

describe("not_received clustering hold", () => {
  const approvalIds: string[] = [];

  it("holds every Kestrel not_received refund for a refunds manager once the merchant total passes the limit", () => {
    for (const id of KESTREL) {
      const result = executeIntent(refundsAgent, {
        tool: "refunds",
        action: "execute",
        recordId: id,
        input: {},
        idempotencyKey: ulid(),
      });
      if (result.outcome.status !== "pending_approval") {
        throw new Error(`expected ${id} to wait for approval, got ${result.outcome.status}`);
      }
      approvalIds.push(result.outcome.approvalId);
      expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
      expect(ruleOf(result.outcome.trace, "clustering_hold")).toMatchObject({
        type: "require_approval",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
      });
      expect(refundTool.get(id)?.status).toBe("requested");
    }
  });

  it("names the merchant and running total in the clustering_hold trace after the existing refund rules", () => {
    const decision = refundDecision("rfnd_0012");
    expect(decision.effect).toBe("require_approval");
    expect(decision.tier).toBe("manager");
    expect(decision.trace.map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "goodwill_approval",
      "clustering_hold",
    ]);
    const hold = ruleOf(decision.trace, "clustering_hold");
    expect(hold.type === "require_approval" && hold.reason).toBe(
      "4 refunds from Kestrel Outdoors add up to $1,880, past the manager limit: a manager must approve",
    );
    expect(decision.reason).toBe(hold.type === "require_approval" ? hold.reason : undefined);
    expect(refundTool.ruleLabels?.clustering_hold).toBeDefined();
  });

  it("leaves a merchant under the limit and a single refund over the line to the existing rules", () => {
    insertRefund("rfnd_hold_small_1", "Small Shop Ltd", 20_000);
    insertRefund("rfnd_hold_small_2", "Small Shop Ltd", 20_000);
    expect(refundDecision("rfnd_hold_small_1").effect).toBe("allow");
    expect(refundDecision("rfnd_hold_small_2").trace).toContainEqual({
      type: "allow",
      rule: "clustering_hold",
    });

    insertRefund("rfnd_hold_big", "Big Ticket Co", 90_000);
    insertRefund("rfnd_hold_big_small", "Big Ticket Co", 5_000);
    const big = refundDecision("rfnd_hold_big");
    expect(big.effect).toBe("require_approval");
    expect(ruleOf(big.trace, "amount_approval").type).toBe("require_approval");
    expect(ruleOf(big.trace, "clustering_hold").type).toBe("allow");
    expect(refundDecision("rfnd_hold_big_small").effect).toBe("allow");
  });

  it("does not count rejected, out-of-window or other-reason refunds toward the total", () => {
    insertRefund("rfnd_hold_harbor_open", "Harbor Goods", 30_000);
    insertRefund("rfnd_hold_harbor_rejected", "Harbor Goods", 30_000, { status: "rejected" });
    insertRefund("rfnd_hold_harbor_old", "Harbor Goods", 30_000, { ageMs: 20 * DAY });
    insertRefund("rfnd_hold_harbor_faulty", "Harbor Goods", 30_000, { reasonCode: "faulty" });
    expect(refundDecision("rfnd_hold_harbor_open").effect).toBe("allow");
    expect(refundDecision("rfnd_hold_harbor_old").effect).toBe("allow");
    expect(refundDecision("rfnd_hold_harbor_faulty").effect).toBe("allow");

    insertRefund("rfnd_hold_harbor_second", "Harbor Goods", 30_000);
    expect(ruleOf(refundDecision("rfnd_hold_harbor_open").trace, "clustering_hold").type).toBe(
      "require_approval",
    );
    expect(ruleOf(refundDecision("rfnd_hold_harbor_old").trace, "clustering_hold").type).toBe(
      "allow",
    );
    expect(ruleOf(refundDecision("rfnd_hold_harbor_faulty").trace, "clustering_hold").type).toBe(
      "allow",
    );
  });

  it("switches both holds off when the clustering window is 0", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    expect(refundDecision("rfnd_0012").effect).toBe("allow");
    expect(ruleOf(kycDecision("kyc_0013").trace, "linked_refund_hold").type).toBe("allow");

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    expect(refundDecision("rfnd_0012").effect).toBe("require_approval");
    expect(ruleOf(kycDecision("kyc_0013").trace, "linked_refund_hold").type).toBe(
      "require_approval",
    );
  });

  it("lets a refunds manager approve a held refund through the existing approval path", () => {
    const [first] = approvalIds;
    const result = approve(refundsManager, first, "Checked the Kestrel pattern.");
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get(KESTREL[0])?.status).toBe("executing");
  });

  it("sends a held customer's KYC approval to a KYC manager even below the risk score", () => {
    const record = kycTool.get("kyc_0013");
    expect(record?.riskScore).toBeLessThan(70);
    const result = executeIntent(kycReviewer, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0013",
      input: {},
      idempotencyKey: ulid(),
    });
    if (result.outcome.status !== "pending_approval") {
      throw new Error(`expected kyc_0013 to wait for approval, got ${result.outcome.status}`);
    }
    expect(ruleOf(result.outcome.trace, "risk_tier_approval").type).toBe("allow");
    expect(ruleOf(result.outcome.trace, "linked_refund_hold")).toMatchObject({
      type: "require_approval",
      tier: "manager",
      allowedRoles: rolesFor("kyc", "manager"),
    });
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");
  });

  it("keeps the admin tier when a held customer's risk score is over the admin line", () => {
    const record = kycTool.get("kyc_0004");
    if (!record) throw new Error("missing kyc_0004");
    insertRefund("rfnd_hold_admin_case", "Kestrel Outdoors", 1_000, { email: String(record.email) });
    const decision = kycDecision("kyc_0004");
    expect(decision.effect).toBe("require_approval");
    expect(decision.tier).toBe("admin");
    expect(decision.allowedRoles).toEqual(["admin"]);
    expect(ruleOf(decision.trace, "linked_refund_hold").type).toBe("require_approval");
  });

  it("keeps KYC approvals for customers without held refunds on the existing rules", () => {
    expect(ruleOf(kycDecision("kyc_0002").trace, "linked_refund_hold").type).toBe("allow");
    const result = executeIntent(kycReviewer, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0001",
      input: {},
      idempotencyKey: ulid(),
    });
    expect(result.outcome.status).toBe("applied");

    db.update(kycCases).set({ status: "pending_review" }).where(eq(kycCases.id, "kyc_0001")).run();
    expect(ruleOf(kycDecision("kyc_0001").trace, "linked_refund_hold").type).toBe("allow");
  });

  it("keeps merchant names, refund ids and emails out of the KYC hold reason", () => {
    const hold = ruleOf(kycDecision("kyc_0013").trace, "linked_refund_hold");
    const text = JSON.stringify(hold);
    expect(hold.type).toBe("require_approval");
    expect(text).not.toContain("Kestrel");
    expect(text).not.toContain("rfnd_");
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/noor/i);
  });
});
