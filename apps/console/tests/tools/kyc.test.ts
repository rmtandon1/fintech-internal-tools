import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor, IntentOutcome } from "@console/engine/types";
import { kycTool, type KycCase } from "@console/tool-kyc";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { admin, kycManager, kycReviewer, setupHarness } from "../helpers/harness";
import { expectRecordStatsMatchList } from "../helpers/stats";

beforeAll(() => {
  setupHarness();
  registerConstants(kycTool.constants ?? []);
  kycTool.seed?.();
});

function act(
  actor: Actor,
  action: string,
  recordId: string,
  input: Record<string, unknown> = {},
) {
  return executeIntent(actor, {
    tool: "kyc",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

describe("kyc review queue", () => {
  it("approves a low-risk case straight through", () => {
    const result = act(kycReviewer, "approve", "kyc_0001");
    expect(result.outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0001")?.status).toBe("approved");
  });

  it("sends a high-risk case to a manager instead of applying it", () => {
    const result = act(kycReviewer, "approve", "kyc_0003");
    expect(result.outcome.status).toBe("pending_approval");
    expect(kycTool.get("kyc_0003")?.status).toBe("pending_review");
  });

  it("escalates to an admin above the admin threshold", () => {
    const result = act(kycReviewer, "approve", "kyc_0004");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "risk_tier_approval",
        tier: "admin",
        allowedRoles: ["admin"],
      }),
    );
  });

  it("denies approval while a sanctions hit is open", () => {
    const result = act(kycManager, "approve", "kyc_0005");
    expect(result.outcome).toMatchObject({ status: "denied" });
    expect(kycTool.get("kyc_0005")?.status).toBe("escalated");
  });

  it("denies approval while documents are outstanding", () => {
    const result = act(kycReviewer, "approve", "kyc_0006");
    expect(result.outcome).toMatchObject({ status: "denied" });
  });

  it("denies approval for a prohibited country", () => {
    const result = act(kycReviewer, "approve", "kyc_0007");
    if (result.outcome.status !== "denied") throw new Error("expected a denial");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "country_permitted", type: "deny" }),
    );
  });

  it("rejects a case with a reason and records the decider", () => {
    const result = act(kycReviewer, "reject", "kyc_0008", {
      reason: "Document tampering detected on upload",
    });
    expect(result.outcome.status).toBe("applied");
    const after = kycTool.get("kyc_0008");
    expect(after?.status).toBe("rejected");
    expect(after?.decidedBy).toBe(kycReviewer.id);
    expect(after?.version).toBe(2);
  });

  it("refuses an action that the record's status does not offer", () => {
    const result = act(kycReviewer, "approve", "kyc_0012");
    expect(result.outcome).toMatchObject({ code: "invalid_status" });
  });

  it("validates the input before anything else runs", () => {
    const result = act(kycReviewer, "reject", "kyc_0002", { reason: "no" });
    expect(result.outcome).toMatchObject({ code: "invalid_input" });
    expect(kycTool.get("kyc_0002")?.status).toBe("pending_review");
  });

  it("seeds a queue deep enough to page through, with high-risk work waiting", () => {
    const { rows, total } = kycTool.list({ filters: {}, limit: 50, offset: 0 });
    expect(total).toBeGreaterThanOrEqual(100);
    expect(rows).toHaveLength(50);
    const pendingHighRisk = kycTool
      .list({ filters: { status: "pending_review" }, limit: 200, offset: 0 })
      .rows.filter((row) => Number(row.riskScore) >= 70);
    expect(pendingHighRisk.length).toBeGreaterThanOrEqual(3);
  });

  it("never seeds an approved case that the approval rules would deny", () => {
    const approved = kycTool
      .list({ filters: { status: "approved" }, limit: 200, offset: 0 })
      .rows.filter((row) => row.documentsComplete === 0 || row.sanctionsHit === 1);
    expect(approved).toEqual([]);
  });

  it("sorts on a declared column in both directions", () => {
    const query = (direction: "asc" | "desc") =>
      kycTool
        .list({ filters: {}, sort: { field: "riskScore", direction }, limit: 10, offset: 0 })
        .rows.map((row) => Number(row.riskScore));

    const ascending = query("asc");
    const descending = query("desc");
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    expect(ascending[0]).toBeLessThan(descending[0]);
  });

  it("ignores a sort field the declaration does not offer", () => {
    const rows = kycTool.list({
      filters: {},
      sort: { field: "documentNumber", direction: "asc" },
      limit: 5,
      offset: 0,
    }).rows;
    const scores = rows.map((row) => Number(row.riskScore));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("requires a manager once a case has been escalated", () => {
    const result = act(kycReviewer, "approve", "kyc_0011");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "escalated_needs_manager" }),
    );
  });
});

describe("kyc stats", () => {
  it("declares three stats for each role that can open the queue", () => {
    for (const role of kycTool.visibleTo) {
      expect(kycTool.stats?.filter((s) => s.roles.includes(role)).length, role).toBe(3);
    }
  });

  it("counts each records stat with the same query its link opens", () => {
    expectRecordStatsMatchList(kycTool);
  });

  it("splits cases by SLA window with the due filter", () => {
    const now = Date.now();
    const all = kycTool.list({ filters: {}, limit: 1000, offset: 0 }).rows;
    const overdue = kycTool.list({ filters: { due: "overdue" }, limit: 1000, offset: 0 });
    const soon = kycTool.list({ filters: { due: "due_12h" }, limit: 1000, offset: 0 });
    expect(soon.total).toBe(
      all.filter((c) => Number(c.dueAt) >= now && Number(c.dueAt) < now + 12 * 60 * 60 * 1000)
        .length,
    );
    for (const row of overdue.rows) {
      expect(Number(row.dueAt)).toBeLessThan(now);
      expect(["pending_review", "info_requested", "escalated"]).toContain(row.status);
    }
    const finishedPastDue = all.filter(
      (c) => Number(c.dueAt) < now && ["approved", "rejected"].includes(String(c.status)),
    );
    expect(finishedPastDue.length).toBeGreaterThan(0);
    expect(overdue.total).toBe(
      all.filter(
        (c) =>
          Number(c.dueAt) < now &&
          ["pending_review", "info_requested", "escalated"].includes(String(c.status)),
      ).length,
    );
    for (const row of soon.rows) expect(Number(row.dueAt)).toBeGreaterThanOrEqual(now);
  });
});

describe("kyc linked refund hold", () => {
  beforeAll(() => {
    registerConstants(refundTool.constants ?? []);
    refundTool.seed?.();
  });

  function noorCase(): KycCase {
    const record = kycTool.get("kyc_0013");
    if (!record) throw new Error("no kyc_0013");
    return record as KycCase;
  }

  function approvePreview(record: KycCase) {
    const preview = previewActions(kycTool, record, kycReviewer).find((p) => p.action === "approve");
    if (!preview?.decision) throw new Error("no approve decision");
    return preview.decision;
  }

  function traceOf(outcome: IntentOutcome) {
    if (!("trace" in outcome) || !outcome.trace) throw new Error("outcome has no trace");
    return outcome.trace;
  }

  it("leaves a case whose customer has no held refunds unchanged: score 68 still clears", () => {
    const record = { ...noorCase(), email: "no.refunds@example.com" };
    expect(record.riskScore).toBe(68);
    const decision = approvePreview(record);
    expect(decision.effect).toBe("allow");
    expect(decision.trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    expect(decision.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
  });

  it("stops holding linked cases with refunds.clustering_window_days at 0", () => {
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    const decision = approvePreview(noorCase());
    expect(decision.effect).toBe("allow");
    expect(decision.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
  });

  it("sends a case whose customer is in a held refund cluster to a manager whatever the risk score", () => {
    expect(noorCase().riskScore).toBe(68);
    const result = act(kycReviewer, "approve", "kyc_0013");
    expect(result.outcome.status).toBe("pending_approval");
    const trace = traceOf(result.outcome);
    expect(trace).toContainEqual({ type: "allow", rule: "risk_tier_approval" });
    expect(trace.filter((o) => o.type !== "allow")).toEqual([
      expect.objectContaining({
        rule: "linked_refund_hold",
        type: "require_approval",
        tier: "manager",
        allowedRoles: expect.arrayContaining(["kyc_manager"]),
        reason:
          "Customer has a refund in a held cluster: Kestrel Outdoors $1,880 over $500 in 14 days",
      }),
    ]);
    expect(kycTool.get("kyc_0013")?.status).toBe("pending_review");
  });
});
