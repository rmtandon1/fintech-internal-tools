import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, listApprovals } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { loadConstants } from "@console/engine/policy/constants";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { IntentOutcome } from "@console/engine/types";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, refundsAgent, refundsManager, setupHarness } from "../helpers/harness";

const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

function execute(recordId: string) {
  return executeIntent(refundsAgent, {
    tool: "refunds",
    action: "execute",
    recordId,
    input: {},
    idempotencyKey: ulid(),
  });
}

function traceOf(outcome: IntentOutcome) {
  if (!("trace" in outcome) || !outcome.trace) throw new Error("outcome has no trace");
  return outcome.trace;
}

function insertRefund(
  id: string,
  merchant: string,
  usdMinor: number,
  hoursAgo: number,
  overrides: { reasonCode?: string; status?: string } = {},
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
      reasonCode: overrides.reasonCode ?? "not_received",
      disputed: 0,
      status: overrides.status ?? "requested",
      requestedBy: null,
      requestedAt: Date.now() - hoursAgo * HOUR,
      settledAt: null,
      lastNote: null,
      version: 1,
    })
    .run();
}

describe("refunds clustering hold", () => {
  it("applies the first not_received refund while the merchant's running total is under the manager line", () => {
    const result = execute("rfnd_0014");
    expect(result.outcome.status).toBe("applied");
    expect(traceOf(result.outcome)).toContainEqual({ type: "allow", rule: "clustering_hold" });
    expect(refundTool.get("rfnd_0014")?.status).toBe("executing");
  });

  it("holds the refund that takes the merchant's not_received total over the manager line at the manager tier, naming clustering_hold, the merchant and the running total", () => {
    const result = execute("rfnd_0013");
    expect(result.outcome.status).toBe("pending_approval");
    const trace = traceOf(result.outcome);
    expect(trace).toContainEqual({ type: "allow", rule: "amount_approval" });
    expect(trace).toContainEqual(
      expect.objectContaining({
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: expect.arrayContaining(["refunds_manager"]),
        reason: "Kestrel Outdoors $925 over $500 in 14 days",
      }),
    );
    expect(refundTool.get("rfnd_0013")?.status).toBe("requested");
  });

  it("holds every later refund in the same cluster", () => {
    const expected: Array<[string, string]> = [
      ["rfnd_0012", "Kestrel Outdoors $1,400 over $500 in 14 days"],
      ["rfnd_0011", "Kestrel Outdoors $1,880 over $500 in 14 days"],
    ];
    for (const [id, reason] of expected) {
      const result = execute(id);
      expect(result.outcome.status).toBe("pending_approval");
      expect(traceOf(result.outcome)).toContainEqual(
        expect.objectContaining({ rule: "clustering_hold", type: "require_approval", tier: "manager", reason }),
      );
    }
  });

  it("leaves refunds with another reason code alone", () => {
    insertRefund("rfnd_hold_faulty", "Kestrel Outdoors", 20_000, 1, { reasonCode: "faulty" });
    const result = execute("rfnd_hold_faulty");
    expect(result.outcome.status).toBe("applied");
    expect(traceOf(result.outcome)).toContainEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("does not count rejected refunds toward the running total", () => {
    insertRefund("rfnd_hold_rej_a", "Rejected Goods Ltd", 30_000, 30, { status: "rejected" });
    insertRefund("rfnd_hold_rej_b", "Rejected Goods Ltd", 25_000, 20);
    insertRefund("rfnd_hold_rej_c", "Rejected Goods Ltd", 20_000, 10);
    const result = execute("rfnd_hold_rej_c");
    expect(result.outcome.status).toBe("applied");
    expect(traceOf(result.outcome)).toContainEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("does not count refunds requested before the window", () => {
    insertRefund("rfnd_hold_old", "Old Orders Co", 40_000, 20 * 24);
    insertRefund("rfnd_hold_new", "Old Orders Co", 20_000, 2);
    const result = execute("rfnd_hold_new");
    expect(result.outcome.status).toBe("applied");
    expect(traceOf(result.outcome)).toContainEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("leaves a refund at or over the manager line to amount_approval", () => {
    insertRefund("rfnd_hold_small", "Large Line Co", 30_000, 5);
    insertRefund("rfnd_hold_large", "Large Line Co", 60_000, 1);
    const result = execute("rfnd_hold_large");
    expect(result.outcome.status).toBe("pending_approval");
    const trace = traceOf(result.outcome);
    expect(trace).toContainEqual(
      expect.objectContaining({ rule: "amount_approval", type: "require_approval", tier: "manager" }),
    );
    expect(trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("holds nothing with refunds.clustering_window_days at 0 and keeps clustering_hold in the trace as allow", () => {
    insertRefund("rfnd_hold_off_a", "Switch Off Ltd", 45_000, 6);
    insertRefund("rfnd_hold_off_b", "Switch Off Ltd", 45_000, 3);
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    const off = execute("rfnd_hold_off_b");
    expect(off.outcome.status).toBe("applied");
    expect(traceOf(off.outcome)).toContainEqual({ type: "allow", rule: "clustering_hold" });

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    insertRefund("rfnd_hold_off_c", "Switch Off Ltd", 10_000, 1);
    const on = execute("rfnd_hold_off_c");
    expect(on.outcome.status).toBe("pending_approval");
    expect(traceOf(on.outcome)).toContainEqual(
      expect.objectContaining({ rule: "clustering_hold", type: "require_approval" }),
    );
  });

  it("runs clustering_hold last on execute", () => {
    insertRefund("rfnd_hold_order", "Order Check Co", 10_000, 1);
    const result = execute("rfnd_hold_order");
    expect(traceOf(result.outcome).map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "goodwill_approval",
      "clustering_hold",
    ]);
  });

  it("declares refunds.clustering_window_days with a 14-day default", () => {
    const declared = refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY);
    expect(declared).toMatchObject({ key: "refunds.clustering_window_days", value: 14, type: "number", tool: "refunds" });
    expect(loadConstants().number(CLUSTERING_WINDOW_DAYS_KEY, -1)).toBe(14);
  });

  it("a refunds manager can approve a held refund", () => {
    const held = listApprovals("pending").find(
      (a) => a.tool === "refunds" && a.recordId === "rfnd_0013",
    );
    if (!held) throw new Error("expected rfnd_0013 to be waiting on a manager");
    const result = approve(refundsManager, held.id, "checked the cluster");
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0013")?.status).toBe("executing");
  });
});
