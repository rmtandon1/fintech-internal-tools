import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approve, listApprovals } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor, IntentOutcome } from "@console/engine/types";
import { caseFile, kycTool } from "@console/tool-kyc";
import { kycCases, kycDiscrepancies } from "@console/tool-kyc/schema";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { admin, manager, analyst, setupHarness } from "../helpers/harness";

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

function traceOf(outcome: IntentOutcome) {
  if (!("trace" in outcome) || !outcome.trace) throw new Error("outcome has no trace");
  return outcome.trace;
}

describe("kyc case file", () => {
  it("kyc_0001 approves straight through", () => {
    const result = act(analyst, "approve", "kyc_0001");
    expect(result.outcome.status).toBe("applied");
    for (const o of traceOf(result.outcome)) {
      expect(o.type).toBe("allow");
    }
  });

  it("kyc_0003 needs a manager by risk score", () => {
    const result = act(analyst, "approve", "kyc_0003");
    expect(result.outcome.status).toBe("pending_approval");
    const trace = traceOf(result.outcome);
    expect(trace).toContainEqual(
      expect.objectContaining({
        rule: "risk_tier_approval",
        type: "require_approval",
        tier: "manager",
      }),
    );
    expect(trace).toContainEqual(expect.objectContaining({ rule: "pep_approval", type: "allow" }));
    expect(trace).toContainEqual(
      expect.objectContaining({ rule: "declared_vs_found", type: "allow" }),
    );
  });

  it("kyc_0005 is denied by no_sanctions_hit", () => {
    const result = act(analyst, "approve", "kyc_0005");
    expect(result.outcome.status).toBe("denied");
    expect(traceOf(result.outcome)).toContainEqual(
      expect.objectContaining({ rule: "no_sanctions_hit", type: "deny" }),
    );
    expect(kycTool.get("kyc_0005")?.lastNote).toContain("sanctions list");
    expect(kycTool.get("kyc_0005")?.lastNote).not.toContain("PEP list");
  });

  it("kyc_0013, the customer behind Kestrel's rfnd_0012, needs a manager with the refund window at 14 (linked_refund_hold) and clears again at 0", () => {
    registerConstants([
      {
        key: CLUSTERING_WINDOW_DAYS_KEY,
        value: 14,
        type: "number",
        description: "Days of refunds a cluster looks back over",
        tool: "refunds",
      },
    ]);
    refundTool.seed?.();
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
    expect(refundTool.get("rfnd_0012")?.merchant).toBe("Kestrel Outdoors");
    const record = kycTool.get("kyc_0013");
    if (!record) throw new Error("missing kyc_0013");
    const held = previewActions(kycTool, record, analyst).find((p) => p.action === "approve")?.decision;
    expect(held?.effect).toBe("require_approval");
    expect(held?.trace).toContainEqual(
      expect.objectContaining({ type: "require_approval", rule: "linked_refund_hold", tier: "manager" }),
    );

    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    const off = previewActions(kycTool, record, analyst).find((p) => p.action === "approve")?.decision;
    expect(off?.effect).toBe("allow");
    expect(off?.trace).toContainEqual({ type: "allow", rule: "linked_refund_hold" });
  });

  it("kyc_0013 approves straight through and the trace holds nothing", () => {
    const result = act(analyst, "approve", "kyc_0013");
    expect(result.outcome.status).toBe("applied");
    for (const o of traceOf(result.outcome)) {
      expect(o.type).toBe("allow");
    }
    expect(kycTool.get("kyc_0013")?.status).toBe("approved");
    const differences = caseFile("kyc_0013").differences;
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatchObject({ topic: "Address", severity: "minor" });
    expect(kycTool.get("kyc_0013")?.materialDifferences).toBe(0);
  });

  it("kyc_0102 needs a manager by pep_approval only", () => {
    const result = act(analyst, "approve", "kyc_0102");
    expect(result.outcome.status).toBe("pending_approval");
    const trace = traceOf(result.outcome);
    const nonAllow = trace.filter((o) => o.type !== "allow");
    expect(nonAllow).toEqual([
      expect.objectContaining({
        rule: "pep_approval",
        type: "require_approval",
        tier: "manager",
        reason: "Politically exposed person: a manager must approve",
      }),
    ]);
    expect(trace).toContainEqual(
      expect.objectContaining({ rule: "risk_tier_approval", type: "allow" }),
    );
  });

  it("the only approved UK business cases are the four seeded merchants, and kyc_0104 opens clean", () => {
    const approvedUkBusiness = db
      .select({ id: kycCases.id })
      .from(kycCases)
      .where(
        and(
          eq(kycCases.country, "GB"),
          eq(kycCases.segment, "business"),
          eq(kycCases.status, "approved"),
        ),
      )
      .all()
      .map((r) => r.id)
      .sort();
    expect(approvedUkBusiness).toEqual(["kyc_0104", "kyc_0105", "kyc_0106", "kyc_0107"]);
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(0);
    const registry = caseFile("kyc_0104").checks.find((c) => c.kind === "company_registry");
    expect(registry?.result).toBe("clear");
    expect(registry?.detail).toContain("Checked by hand");
  });

  it("kyc_0103 needs a manager by declared_vs_found only", () => {
    const result = act(analyst, "approve", "kyc_0103");
    expect(result.outcome.status).toBe("pending_approval");
    const nonAllow = traceOf(result.outcome).filter((o) => o.type !== "allow");
    expect(nonAllow).toEqual([
      expect.objectContaining({
        rule: "declared_vs_found",
        type: "require_approval",
        tier: "manager",
        reason:
          "2 material differences between what the customer declared and what the checks found",
      }),
    ]);
    expect(kycTool.get("kyc_0103")?.materialDifferences).toBe(2);
  });

  it("a manager can approve the held requests", () => {
    const pending = listApprovals("pending").filter(
      (a) => a.tool === "kyc" && (a.recordId === "kyc_0102" || a.recordId === "kyc_0103"),
    );
    expect(pending.map((a) => a.recordId).sort()).toEqual(["kyc_0102", "kyc_0103"]);
    for (const a of pending) {
      const result = approve(manager, a.id, "reviewed");
      expect(result.outcome.status).toBe("applied");
    }
    expect(kycTool.get("kyc_0102")?.status).toBe("approved");
    expect(kycTool.get("kyc_0103")?.status).toBe("approved");
  });

  it("every seeded case's sanctions and PEP checks agree with its flags", () => {
    const { rows } = kycTool.list({ filters: {}, limit: 1000, offset: 0 });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const { checks } = caseFile(row.id);
      expect(checks).toHaveLength(5);
      expect(checks.map((c) => c.kind).sort()).toEqual(
        ["sanctions", "pep", "adverse_media", "company_registry", "identity_document"].sort(),
      );
      const sanctions = checks.find((c) => c.kind === "sanctions");
      const pep = checks.find((c) => c.kind === "pep");
      expect(sanctions?.result).toBe(row.sanctionsHit === 1 ? "possible_match" : "clear");
      expect(pep?.result).toBe(row.pep === 1 ? "match" : "clear");
    }
  });

  it("no seeded approved case has a PEP match or a material difference", () => {
    // Cases approved inside this test file (kyc_0001, kyc_0102, kyc_0103) have
    // a decider; the seeded-approved rows are the ones the seed vouches for.
    const approved = kycTool
      .list({ filters: { status: "approved" }, limit: 1000, offset: 0 })
      .rows.filter((row) => row.decidedBy === null);
    expect(approved.length).toBeGreaterThan(0);
    for (const row of approved) {
      expect(row.pep).toBe(0);
      expect(row.materialDifferences).toBe(0);
    }
  });

  it("the register holds no PII", () => {
    const { rows } = kycTool.list({ filters: {}, limit: 1000, offset: 0 });
    for (const row of rows) {
      for (const d of caseFile(row.id).differences) {
        for (const value of [d.topic, d.declared, d.found, d.source]) {
          expect(value).not.toMatch(/@/);
          expect(value).not.toMatch(/\d{5,}/);
          expect(value).not.toBe(row.documentNumber);
          expect(value).not.toBe(row.email);
        }
      }
    }
  });

  it("materialDifferences is read live, never stored", () => {
    const before = kycTool.get("kyc_0002")?.materialDifferences;
    expect(before).toBe(0);
    db.insert(kycDiscrepancies)
      .values({
        id: "kyc_0002_diff_test",
        caseId: "kyc_0002",
        topic: "Employer",
        declared: "None",
        found: "Payslips from an employer",
        source: "Document check",
        severity: "material",
      })
      .run();
    expect(kycTool.get("kyc_0002")?.materialDifferences).toBe(1);
    db.delete(kycDiscrepancies).where(eq(kycDiscrepancies.id, "kyc_0002_diff_test")).run();
    expect(kycTool.get("kyc_0002")?.materialDifferences).toBe(0);
  });

  it("approve's rules run in order with the new rules before escalation", () => {
    const result = act(analyst, "approve", "kyc_0004");
    const rules = traceOf(result.outcome).map((o) => o.rule);
    expect(rules).toEqual([
      "documents_complete",
      "no_sanctions_hit",
      "country_permitted",
      "risk_tier_approval",
      "pep_approval",
      "declared_vs_found",
      "linked_refund_hold",
      "escalated_needs_manager",
    ]);
  });
});
