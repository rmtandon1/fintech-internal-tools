import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approvalRequests } from "@console/db-core/engine-schema";
import { executeIntent } from "@console/engine/execute-intent";
import { loadConstants } from "@console/engine/policy/constants";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  MANAGER_APPROVAL_USD_KEY,
  clusteringHoldFor,
  refundTool,
} from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

const HOUR = 60 * 60 * 1000;
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

function setting(key: string, value: string) {
  expect(setConstant(admin, key, value).ok).toBe(true);
}

function holdOutcome(recordId: string) {
  const record = refundTool.get(recordId);
  if (!record) throw new Error(`missing ${recordId}`);
  const preview = previewActions(refundTool, record, analyst).find((p) => p.action === "execute");
  const outcome = preview?.decision?.trace.find((o) => o.rule === "clustering_hold");
  if (!outcome) throw new Error(`no clustering_hold outcome on ${recordId}`);
  return outcome;
}

function act(actor: Actor, action: string, recordId: string, input: Record<string, unknown> = {}) {
  return executeIntent(actor, {
    tool: "refunds",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

function setStatus(id: string, status: string) {
  db.update(refunds).set({ status }).where(eq(refunds.id, id)).run();
}

function insertRefund(id: string, merchant: string, reasonCode: string, usdMinor: number, hoursAgo: number) {
  db.insert(refunds)
    .values({
      id,
      paymentId: `pay_${id}`,
      customerEmail: `${id}@example.com`,
      cardLast4: "0001",
      merchant,
      psp: "stripe",
      currency: "USD",
      capturedMinor: usdMinor,
      refundedMinor: 0,
      amountMinor: usdMinor,
      usdMinor,
      reasonCode,
      disputed: 0,
      status: "requested",
      requestedBy: null,
      requestedAt: Date.now() - hoursAgo * HOUR,
      settledAt: null,
      lastNote: null,
      version: 1,
    })
    .run();
}

describe("refunds clustering hold", () => {
  it("declares refunds.clustering_window_days at 0, so every Kestrel refund still pays straight through until an admin turns the hold on", () => {
    const declared = refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY);
    expect(declared?.value).toBe(0);
    expect(loadConstants().number(CLUSTERING_WINDOW_DAYS_KEY, -1)).toBe(0);
    for (const id of KESTREL) {
      expect(holdOutcome(id)).toEqual({ type: "allow", rule: "clustering_hold" });
      const record = refundTool.get(id);
      if (!record) throw new Error(`missing ${id}`);
      const preview = previewActions(refundTool, record, analyst).find((p) => p.action === "execute");
      expect(preview?.decision?.effect).toBe("allow");
    }
  });

  it("holds the refund that takes a merchant's not_received total over the manager limit, naming the merchant and running total", () => {
    setting(CLUSTERING_WINDOW_DAYS_KEY, "14");
    expect(holdOutcome("rfnd_0014")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0013")).toEqual({
      type: "require_approval",
      rule: "clustering_hold",
      tier: "manager",
      allowedRoles: rolesFor("refunds", "manager"),
      reason: `Kestrel Outdoors's "not received" refunds add up to $925 in 14 days, past the $500 manager limit`,
    });
    expect(holdOutcome("rfnd_0012")).toMatchObject({ type: "require_approval", reason: expect.stringContaining("$1,400") });
    expect(holdOutcome("rfnd_0011")).toMatchObject({ type: "require_approval", reason: expect.stringContaining("$1,880") });
    const record = refundTool.get("rfnd_0011");
    if (!record) throw new Error("missing rfnd_0011");
    const preview = previewActions(refundTool, record, analyst).find((p) => p.action === "execute");
    expect(preview?.decision?.effect).toBe("require_approval");
    expect(preview?.decision?.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
  });

  it("moves held refunds out of the analyst queue into the manager queue", () => {
    const list = (queue: "analyst" | "manager") =>
      refundTool.list({ filters: { queue }, limit: 1000, offset: 0 }).rows.map((row) => row.id);
    const analystRows = list("analyst");
    const managerRows = list("manager");
    expect(analystRows).toContain("rfnd_0014");
    expect(managerRows).not.toContain("rfnd_0014");
    for (const id of ["rfnd_0011", "rfnd_0012", "rfnd_0013"]) {
      expect(analystRows).not.toContain(id);
      expect(managerRows).toContain(id);
    }
  });

  it("refuses an analyst and lets a manager pay or reject a held refund directly without an approval request", () => {
    const reason = `Kestrel Outdoors's "not received" refunds add up to $925 in 14 days, past the $500 manager limit`;
    expect(act(analyst, "execute", "rfnd_0013").outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
      message: `Needs a manager: ${reason}`,
    });
    expect(act(analyst, "reject", "rfnd_0013", { reason: "Not eligible for payment" }).outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
    });
    expect(refundTool.get("rfnd_0013")?.status).toBe("requested");

    const paid = act(manager, "execute", "rfnd_0013");
    expect(paid.outcome.status).toBe("applied");
    expect(paid.outcome.trace).toContainEqual(
      expect.objectContaining({ type: "require_approval", rule: "clustering_hold", tier: "manager" }),
    );
    expect(refundTool.get("rfnd_0013")?.status).toBe("executing");

    const rejected = act(manager, "reject", "rfnd_0011", { reason: "Pattern of not-received claims" });
    expect(rejected.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0011")?.status).toBe("rejected");

    const approvals = db
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.tool, "refunds"), eq(approvalRequests.recordId, "rfnd_0013")))
      .all();
    expect(approvals).toEqual([]);

    setStatus("rfnd_0013", "requested");
    setStatus("rfnd_0011", "requested");
  });

  it("does not count rejected refunds toward the running total", () => {
    setStatus("rfnd_0014", "rejected");
    expect(holdOutcome("rfnd_0013")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0012")).toMatchObject({ type: "require_approval", reason: expect.stringContaining("$935") });
    setStatus("rfnd_0014", "requested");
  });

  it("only counts refunds inside the window", () => {
    setting(CLUSTERING_WINDOW_DAYS_KEY, "2");
    expect(holdOutcome("rfnd_0014")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0013")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0012")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0011")).toMatchObject({
      type: "require_approval",
      reason: expect.stringContaining("add up to $955 in 2 days"),
    });
    setting(CLUSTERING_WINDOW_DAYS_KEY, "14");
  });

  it("ignores other reason codes and other merchants", () => {
    insertRefund("rfnd_test_faulty", "Kestrel Outdoors", "faulty", 45_000, 90);
    insertRefund("rfnd_test_other", "Pine Supply", "not_received", 30_000, 40);
    expect(holdOutcome("rfnd_test_faulty")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_test_other")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0014")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0013")).toMatchObject({ type: "require_approval", reason: expect.stringContaining("$925") });
  });

  it("follows refunds.manager_approval_usd_minor when an admin moves the limit", () => {
    setting(MANAGER_APPROVAL_USD_KEY, "100000");
    expect(holdOutcome("rfnd_0013")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(holdOutcome("rfnd_0012")).toMatchObject({
      type: "require_approval",
      reason: expect.stringContaining("past the $1,000 manager limit"),
    });
    setting(MANAGER_APPROVAL_USD_KEY, "50000");
    expect(holdOutcome("rfnd_0013")).toMatchObject({ type: "require_approval" });
  });

  it("a window of 0 switches the hold off and clustering_hold answers allow", () => {
    setting(CLUSTERING_WINDOW_DAYS_KEY, "0");
    for (const id of KESTREL) {
      expect(holdOutcome(id)).toEqual({ type: "allow", rule: "clustering_hold" });
      const row = db.select().from(refunds).where(eq(refunds.id, id)).get();
      if (!row) throw new Error(`missing ${id}`);
      expect(clusteringHoldFor(row, loadConstants())).toBeNull();
    }
    expect(refundTool.list({ filters: { queue: "manager" }, limit: 1000, offset: 0 }).rows.map((r) => r.id)).not.toContain("rfnd_0013");

    setting(CLUSTERING_WINDOW_DAYS_KEY, "-3");
    expect(holdOutcome("rfnd_0013")).toMatchObject({ type: "require_approval", reason: expect.stringContaining("in 14 days") });
    setting(CLUSTERING_WINDOW_DAYS_KEY, "14");
  });

  it("runs clustering_hold after the amount and goodwill limits in execute's trace", () => {
    const record = refundTool.get("rfnd_0013");
    if (!record) throw new Error("missing rfnd_0013");
    const preview = previewActions(refundTool, record, analyst).find((p) => p.action === "execute");
    expect(preview?.decision?.trace.map((o) => o.rule)).toEqual([
      "within_captured_amount",
      "not_disputed",
      "amount_approval",
      "goodwill_approval",
      "clustering_hold",
    ]);
    expect(refundTool.ruleLabels?.clustering_hold).toBeDefined();
  });
});
