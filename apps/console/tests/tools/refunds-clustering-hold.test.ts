import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, canDecide, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor, PolicyDecision } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  MANAGER_APPROVAL_USD_KEY,
  refundTool,
} from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, kycManager, refundsAgent, refundsManager, setupHarness } from "../helpers/harness";

const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

function act(actor: Actor, action: string, recordId: string) {
  return executeIntent(actor, {
    tool: "refunds",
    action,
    recordId,
    input: {},
    idempotencyKey: ulid(),
  });
}

function decision(id: string): PolicyDecision {
  const record = refundTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  const preview = previewActions(refundTool, record, refundsAgent).find(
    (p) => p.action === "execute",
  );
  if (!preview?.decision) throw new Error(`no execute decision for ${id}`);
  return preview.decision;
}

function hold(id: string) {
  return decision(id).trace.find((o) => o.rule === "clustering_hold");
}

function insertRefund(
  id: string,
  merchant: string,
  usdMinor: number,
  opts: { reasonCode?: string; status?: string; daysAgo?: number } = {},
): void {
  db.insert(refunds)
    .values({
      id,
      paymentId: `pay_${id}`,
      customerEmail: `${id}@example.com`,
      cardLast4: "4242",
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
      requestedAt: Date.now() - (opts.daysAgo ?? 1) * DAY,
      settledAt: null,
      lastNote: null,
      version: 1,
    })
    .run();
}

let heldApprovalId = "";

describe("refund clustering hold", () => {
  it("holds a not_received refund for a refunds manager once its merchant's refunds add up past the manager limit", () => {
    const result = act(refundsAgent, "execute", "rfnd_0011");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    heldApprovalId = result.outcome.approvalId;
    const approval = getApproval(heldApprovalId);
    expect(approval?.tier).toBe("manager");
    expect(approval?.allowedRoles).toEqual(rolesFor("refunds", "manager"));
    expect(result.outcome.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ type: "require_approval", rule: "clustering_hold", tier: "manager" }),
    );
    expect(refundTool.get("rfnd_0011")?.status).toBe("requested");
  });

  it("names the merchant and the running total in the clustering_hold trace", () => {
    const d = decision("rfnd_0012");
    expect(d.effect).toBe("require_approval");
    expect(d.trace.map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "clustering_hold",
      "goodwill_approval",
    ]);
    expect(hold("rfnd_0012")).toEqual({
      type: "require_approval",
      rule: "clustering_hold",
      tier: "manager",
      allowedRoles: rolesFor("refunds", "manager"),
      reason: 'Kestrel Outdoors "not received" refunds add up to $1,880 in 14 days, past the $500 manager limit',
    });
  });

  it("holds at exactly the manager limit and lets the merchant through below it", () => {
    insertRefund("rfnd_edge_a", "Edge Supplies", 25_000);
    insertRefund("rfnd_edge_b", "Edge Supplies", 24_999);
    expect(decision("rfnd_edge_b").effect).toBe("allow");
    expect(hold("rfnd_edge_b")).toEqual({ type: "allow", rule: "clustering_hold" });

    insertRefund("rfnd_edge_c", "Edge Supplies", 1);
    expect(decision("rfnd_edge_b").effect).toBe("require_approval");
    expect(hold("rfnd_edge_b")?.type).toBe("require_approval");
    expect(hold("rfnd_edge_c")?.type).toBe("require_approval");
  });

  it("counts only not_received refunds from the same merchant inside the clustering window", () => {
    insertRefund("rfnd_win_old", "Window Goods", 30_000, { daysAgo: 20 });
    insertRefund("rfnd_win_faulty", "Window Goods", 30_000, { reasonCode: "faulty" });
    insertRefund("rfnd_win_other", "Other Goods", 30_000);
    insertRefund("rfnd_win_new", "Window Goods", 30_000);
    expect(decision("rfnd_win_new").effect).toBe("allow");
    expect(hold("rfnd_win_faulty")).toEqual({ type: "allow", rule: "clustering_hold" });

    db.update(refunds)
      .set({ requestedAt: Date.now() - 13 * DAY })
      .where(eq(refunds.id, "rfnd_win_old"))
      .run();
    expect(decision("rfnd_win_new").effect).toBe("require_approval");
    expect(hold("rfnd_win_new")?.type).toBe("require_approval");
    expect(hold("rfnd_win_other")).toEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("does not count rejected refunds toward the merchant total", () => {
    insertRefund("rfnd_rej_a", "Rejected Parts", 30_000, { status: "rejected" });
    insertRefund("rfnd_rej_b", "Rejected Parts", 30_000);
    expect(decision("rfnd_rej_b").effect).toBe("allow");

    db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, "rfnd_rej_a")).run();
    expect(decision("rfnd_rej_b").effect).toBe("require_approval");
  });

  it("leaves a refund over the manager line to amount_approval and keeps the admin tier", () => {
    insertRefund("rfnd_big_admin", "Kestrel Outdoors", 600_000);
    const d = decision("rfnd_big_admin");
    expect(d.effect).toBe("require_approval");
    expect(d.tier).toBe("admin");
    expect(d.allowedRoles).toEqual(["admin"]);
    expect(hold("rfnd_big_admin")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(hold("rfnd_0013")?.type).toBe("require_approval");
  });

  it("switches the hold off when refunds.clustering_window_days is 0", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    expect(decision("rfnd_0012").effect).toBe("allow");
    expect(hold("rfnd_0012")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    expect(decision("rfnd_0012").effect).toBe("require_approval");
  });

  it("reads the manager limit from live constants on every evaluation", () => {
    db.delete(refunds).where(eq(refunds.id, "rfnd_big_admin")).run();
    expect(setConstant(admin, MANAGER_APPROVAL_USD_KEY, "200000").ok).toBe(true);
    expect(decision("rfnd_0012").effect).toBe("allow");
    expect(setConstant(admin, MANAGER_APPROVAL_USD_KEY, "50000").ok).toBe(true);
    expect(decision("rfnd_0012").effect).toBe("require_approval");
  });

  it("only a refunds manager decides a clustering hold, and approving sends the refund to the processor", () => {
    const approval = getApproval(heldApprovalId);
    if (!approval) throw new Error("missing approval");
    expect(canDecide(approval, refundsAgent).ok).toBe(false);
    expect(canDecide(approval, kycManager).ok).toBe(false);
    expect(canDecide(approval, refundsManager).ok).toBe(true);

    const result = approve(refundsManager, heldApprovalId);
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0011")?.status).toBe("executing");
  });
});
