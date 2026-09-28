import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { sqlite } from "@console/db-core";
import { verifyChain } from "@console/engine/audit/verify";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor, IntentResult } from "@console/engine/types";
import {
  automationTool,
  buildContext,
  ContextFile,
  getRun,
  CHARGEBACKS_FROM_POWER_APPS,
  COMPANIES_HOUSE_CHECK,
  REFUND_CLUSTERING_HOLD,
  STRUCTURED_OUTPUT_JSON_SCHEMA,
  StructuredOutput,
  type DevinRun,
} from "@console/tool-automation";
import { listExport } from "@console/tool-automation/context";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { admin, kycManager, refundsAgent, refundsManager, setupHarness } from "../helpers/harness";

const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };
const secondEngineer: Actor = { id: "usr_engineer_2", name: "Engineer 2", role: "engineer" };

const SHA = "a".repeat(64);
const OTHER_SHA = "b".repeat(64);
const PR = "https://github.com/rmtandon1/buy-v-build-cog-demo/pull/99";
/** The UK business case the Companies House check starts from. */
const CASE = "kyc_0003";
/** The four Kestrel Outdoors not_received refunds the seed ships. */
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];
const EVIDENCE = [CASE];
/** The repository root, where the Power Apps exports are committed. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim();

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
});

function act(actor: Actor, action: string, recordId: string | null, input: Record<string, unknown>) {
  return executeIntent(actor, {
    tool: "automation",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

function dispatch(actor: Actor, overrides: Record<string, unknown> = {}) {
  return act(actor, "dispatch", null, {
    spec: COMPANIES_HOUSE_CHECK.file,
    kind: "IMPLEMENTATION/ADDITION",
    scope: "rule",
    intent: COMPANIES_HOUSE_CHECK.intents["IMPLEMENTATION/ADDITION"],
    contextSha256: SHA,
    evidenceIds: EVIDENCE,
    ...overrides,
  });
}

function applied(result: IntentResult): DevinRun {
  expect(result.outcome.status).toBe("applied");
  if (result.outcome.status !== "applied") throw new Error("unreachable");
  const run = getRun(result.outcome.recordId);
  if (!run) throw new Error("run not stored");
  return run;
}

function deniedBy(result: IntentResult, rule: string): void {
  expect(result.outcome.status).toBe("denied");
  if (result.outcome.status !== "denied") return;
  const hit = result.outcome.trace.find((r) => r.type === "deny");
  expect(hit?.rule).toBe(rule);
}

function stop(run: DevinRun, actor: Actor = admin): void {
  applied(act(actor, "stop", run.id, { reason: "test cleanup" }));
}

/** Walk a run to `merged` so a later test can reverse it. */
function merge(run: DevinRun, sessionId = `devin-${run.id}`): DevinRun {
  applied(act(admin, "record_session", run.id, { sessionId }));
  applied(act(engineer, "approve_pr", run.id, { prUrl: PR, checksGreen: true, branchContextSha256: SHA }));
  return applied(act(engineer, "record_merge", run.id, { mergeCommit: "c0ffee1234abcd", prUrl: PR }));
}

function auditRowsFor(recordId: string): { action: string; event: string; payload: string }[] {
  return sqlite
    .prepare(
      "SELECT action, event, payload_json AS payload FROM audit_log WHERE record_id = ? ORDER BY seq",
    )
    .all(recordId) as { action: string; event: string; payload: string }[];
}

describe("automation tool", () => {
  it("is visible to the domain managers, the admin and the engineer, and not to agents", () => {
    expect(automationTool.visibleTo).toEqual(
      expect.arrayContaining(["refunds_manager", "kyc_manager", "admin", "engineer"]),
    );
    expect(dispatch(refundsAgent).outcome).toMatchObject({ code: "forbidden_role" });
  });
});

describe("dispatch rules", () => {
  it("role_may_start_kind: the KYC manager may start an ADDITION of a KYC spec", () => {
    const run = applied(dispatch(kycManager));
    expect(run).toMatchObject({
      status: "dispatched",
      kind: "IMPLEMENTATION/ADDITION",
      tool: "kyc",
      scope: "rule",
      contextSha256: SHA,
      requestedBy: kycManager.id,
      reverses: null,
    });
    stop(run);
  });

  it("role_may_start_kind: a manager of another domain is denied", () => {
    deniedBy(dispatch(refundsManager), "role_may_start_kind");
  });

  it("role_may_start_kind: the refunds manager may ask for a refunds rule from its cluster", () => {
    const kestrel = {
      spec: REFUND_CLUSTERING_HOLD.file,
      intent: REFUND_CLUSTERING_HOLD.intents["IMPLEMENTATION/ADDITION"],
      evidenceIds: KESTREL,
    };
    deniedBy(dispatch(kycManager, kestrel), "role_may_start_kind");
    const run = applied(dispatch(refundsManager, kestrel));
    expect(run.tool).toBe("refunds");
    stop(run);
  });

  it("role_may_start_kind: a new app is the admin's to ask for", () => {
    const chargebacks = {
      spec: CHARGEBACKS_FROM_POWER_APPS.file,
      scope: "engine",
      intent: CHARGEBACKS_FROM_POWER_APPS.intents["IMPLEMENTATION/ADDITION"],
      evidenceIds: ["README.md"],
    };
    deniedBy(dispatch(refundsManager, chargebacks), "role_may_start_kind");
    deniedBy(dispatch(kycManager, chargebacks), "role_may_start_kind");
    stop(applied(dispatch(admin, chargebacks)));
  });

  it("role_may_start_kind: only the admin may start a REVERSAL", () => {
    const merged = merge(applied(dispatch(admin)));
    deniedBy(
      dispatch(kycManager, { kind: "REVERSAL", reverses: merged.id, evidenceIds: [] }),
      "role_may_start_kind",
    );
    const reversal = applied(
      dispatch(admin, {
        kind: "REVERSAL",
        reverses: merged.id,
        evidenceIds: [],
        intent: COMPANIES_HOUSE_CHECK.intents.REVERSAL,
      }),
    );
    expect(reversal.reverses).toBe(merged.id);
    stop(reversal);
  });

  it("spec_known: a kind the spec does not offer is denied", () => {
    deniedBy(dispatch(admin, { kind: "IMPLEMENTATION/CHANGE" }), "spec_known");
    deniedBy(dispatch(admin, { spec: "NOPE.md" }), "spec_known");
  });

  it("engine_scope_admin_only: a manager is denied engine scope, the admin is not", () => {
    deniedBy(dispatch(kycManager, { scope: "engine" }), "engine_scope_admin_only");
    const run = applied(dispatch(admin, { scope: "engine" }));
    expect(run.scope).toBe("engine");
    stop(run);
  });

  it("no_run_in_flight_on_tool: a second run against the same tool is denied until the first ends", () => {
    const first = applied(dispatch(kycManager));
    deniedBy(dispatch(admin), "no_run_in_flight_on_tool");
    applied(act(kycManager, "record_session", first.id, { sessionId: "devin-abc" }));
    deniedBy(dispatch(admin), "no_run_in_flight_on_tool");
    stop(first);
    const second = applied(dispatch(admin));
    stop(second);
  });

  it("no_run_in_flight_on_tool: a failed dispatch does not hold the tool", () => {
    const failed = applied(dispatch(kycManager));
    applied(act(kycManager, "record_session", failed.id, { error: "Devin API 503" }));
    expect(getRun(failed.id)?.status).toBe("dispatch_failed");
    const next = applied(dispatch(kycManager));
    stop(next);
  });

  it("reversal_names_merged_implementation: denies a missing, unmerged, or already reversed target", () => {
    deniedBy(
      dispatch(admin, { kind: "REVERSAL", evidenceIds: [] }),
      "reversal_names_merged_implementation",
    );
    deniedBy(
      dispatch(admin, { kind: "REVERSAL", reverses: "run_does_not_exist", evidenceIds: [] }),
      "reversal_names_merged_implementation",
    );

    const stopped = applied(dispatch(admin));
    stop(stopped);
    deniedBy(
      dispatch(admin, { kind: "REVERSAL", reverses: stopped.id, evidenceIds: [] }),
      "reversal_names_merged_implementation",
    );

    const merged = merge(applied(dispatch(admin)));
    const reversal = applied(dispatch(admin, { kind: "REVERSAL", reverses: merged.id, evidenceIds: [] }));
    merge(reversal, "devin-reversal");
    deniedBy(
      dispatch(admin, { kind: "REVERSAL", reverses: merged.id, evidenceIds: [] }),
      "reversal_names_merged_implementation",
    );
    deniedBy(
      dispatch(admin, { kind: "REVERSAL", reverses: reversal.id, evidenceIds: [] }),
      "reversal_names_merged_implementation",
    );
  });

  it("implementation_carries_evidence: an ADDITION without evidence is denied", () => {
    deniedBy(dispatch(kycManager, { evidenceIds: [] }), "implementation_carries_evidence");
  });

  it("actor_owns_run_domain: a manager of another domain cannot record or stop a KYC run", () => {
    const run = applied(dispatch(kycManager));
    deniedBy(act(refundsManager, "record_session", run.id, { sessionId: "devin-x" }), "actor_owns_run_domain");
    deniedBy(act(refundsManager, "stop", run.id, { reason: "not mine" }), "actor_owns_run_domain");
    expect(getRun(run.id)?.status).toBe("dispatched");
    stop(run, kycManager);
  });

  it("audits the context SHA and spec, never the context body", () => {
    const run = applied(dispatch(kycManager));
    const [row] = auditRowsFor(run.id);
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    expect(payload).toMatchObject({ spec: COMPANIES_HOUSE_CHECK.file, contextSha256: SHA });
    expect(Object.keys(payload)).not.toContain("evidence");
    expect(Object.keys(payload)).not.toContain("constants");
    stop(run);
  });
});

describe("approve_pr", () => {
  function running(requester: Actor = kycManager): DevinRun {
    const run = applied(dispatch(requester));
    return applied(act(requester, "record_session", run.id, { sessionId: `devin-${run.id}` }));
  }
  const green = { prUrl: PR, checksGreen: true, branchContextSha256: SHA };

  it("denies the requester, even when the requester holds the engineer role", () => {
    const run = applied(dispatch(admin));
    applied(act(admin, "record_session", run.id, { sessionId: "devin-self" }));
    const selfApprover: Actor = { ...engineer, id: admin.id };
    deniedBy(act(selfApprover, "approve_pr", run.id, green), "approver_is_not_requester");
    stop(run);
  });

  it("refuses a non-engineer outright", () => {
    const run = running();
    expect(act(admin, "approve_pr", run.id, green).outcome).toMatchObject({ code: "forbidden_role" });
    expect(act(kycManager, "approve_pr", run.id, green).outcome).toMatchObject({ code: "forbidden_role" });
    stop(run);
  });

  it("denies red checks", () => {
    const run = running();
    deniedBy(act(engineer, "approve_pr", run.id, { ...green, checksGreen: false }), "checks_green");
    stop(run);
  });

  it("denies a branch whose context.json differs from the dispatched one", () => {
    const run = running();
    deniedBy(
      act(engineer, "approve_pr", run.id, { ...green, branchContextSha256: OTHER_SHA }),
      "context_matches_dispatch",
    );
    stop(run);
  });

  it("is only offered while the run is running", () => {
    const run = applied(dispatch(kycManager));
    expect(act(engineer, "approve_pr", run.id, green).outcome).toMatchObject({ code: "invalid_status" });
    stop(run);
  });
});

describe("context.json", () => {
  function build(runId = "run_ctx") {
    return buildContext({
      runId,
      kind: "IMPLEMENTATION/ADDITION",
      spec: COMPANIES_HOUSE_CHECK,
      scope: "rule",
      intent: COMPANIES_HOUSE_CHECK.intents["IMPLEMENTATION/ADDITION"] ?? "",
      requestedBy: "kyc_manager",
      evidenceKey: CASE,
      evidenceIds: EVIDENCE,
      repoRoot: process.cwd(),
    });
  }

  it("carries only a business case's public facts, and no email or document of a person", () => {
    const { context, json } = build();
    expect(context.evidence.source).toBe(`kyc:${CASE}`);
    expect(context.evidence.rows).toHaveLength(1);
    const [row] = context.evidence.rows;
    expect(Object.keys(row.facts).sort()).toEqual([
      "company",
      "country",
      "registrationNumber",
      "registryCheck",
      "status",
    ]);
    expect(row.facts).toMatchObject({ company: "Northwind Freight Ltd", registrationNumber: "10774521" });
    expect(json).not.toMatch(/email|card|last4|@|dateOfBirth/i);
    expect(ContextFile.parse(context)).toEqual(context);
  });

  it("refuses evidence that isn't the one record, or a case that isn't a UK business", () => {
    const attempt = (evidenceKey: string, evidenceIds: string[]) => () =>
      buildContext({
        runId: "run_stray",
        kind: "IMPLEMENTATION/ADDITION",
        spec: COMPANIES_HOUSE_CHECK,
        scope: "rule",
        intent: "x",
        requestedBy: "admin",
        evidenceKey,
        evidenceIds,
      });
    expect(attempt(CASE, [CASE, "kyc_0001"])).toThrow(/that record alone/);
    expect(attempt("kyc_0001", ["kyc_0001"])).toThrow(/not a UK business case/);
    expect(attempt("kyc_9999", ["kyc_9999"])).toThrow(/no KYC case/);
  });

  it("reads a refund cluster by amount, merchant, reason and time, never by customer", () => {
    const { context, json } = buildContext({
      runId: "run_cluster",
      kind: "IMPLEMENTATION/ADDITION",
      spec: REFUND_CLUSTERING_HOLD,
      scope: "rule",
      intent: "x",
      requestedBy: "refunds_manager",
      evidenceKey: "Kestrel Outdoors",
      evidenceIds: KESTREL,
    });
    expect(context.evidence.source).toBe("refunds:Kestrel Outdoors");
    expect(context.evidence.rows).toHaveLength(KESTREL.length);
    for (const row of context.evidence.rows) {
      expect(Object.keys(row.facts).sort()).toEqual(["merchant", "reasonCode", "requestedAt", "usdMinor"]);
    }
    expect(json).not.toMatch(/email|card|last4|@/i);
    const attempt = (evidenceKey: string, evidenceIds: string[]) => () =>
      buildContext({
        runId: "run_cluster_bad",
        kind: "IMPLEMENTATION/ADDITION",
        spec: REFUND_CLUSTERING_HOLD,
        scope: "rule",
        intent: "x",
        requestedBy: "admin",
        evidenceKey,
        evidenceIds,
      });
    expect(attempt("Kestrel Outdoors", [...KESTREL, "rfnd_0001"])).toThrow(/not in cluster Kestrel Outdoors: rfnd_0001/);
    expect(attempt("No Such Merchant", KESTREL)).toThrow(/has no group No Such Merchant/);
  });

  it("lists an app's committed Power Apps export, and refuses a file that isn't in it", () => {
    const files = listExport(ROOT, "chargebacks");
    expect(files).toEqual(
      expect.arrayContaining(["Data/disputes.csv", "Workflows/DeadlineAlert.json", "Src/App.pa.yaml"]),
    );
    const { context } = buildContext({
      runId: "run_export",
      kind: "IMPLEMENTATION/ADDITION",
      spec: CHARGEBACKS_FROM_POWER_APPS,
      scope: "engine",
      intent: "x",
      requestedBy: "admin",
      evidenceKey: "chargebacks",
      evidenceIds: files,
      repoRoot: ROOT,
    });
    expect(context.evidence.rows.map((r) => r.id)).toEqual([...files].sort());
    expect(context.evidence.rows.find((r) => r.id === "Data/disputes.csv")?.facts.lines).toBe(52);
    expect(() =>
      buildContext({
        runId: "run_export_stray",
        kind: "IMPLEMENTATION/ADDITION",
        spec: CHARGEBACKS_FROM_POWER_APPS,
        scope: "engine",
        intent: "x",
        requestedBy: "admin",
        evidenceKey: "chargebacks",
        evidenceIds: ["../../../.env"],
        repoRoot: ROOT,
      }),
    ).toThrow(/not in the chargebacks export/);
  });

  it("snapshots the spec's constants, the scope globs, the base commit and the audit head", () => {
    const { context } = build();
    expect(Object.keys(context.constants).sort()).toEqual(
      [...COMPANIES_HOUSE_CHECK.constantKeys].sort(),
    );
    for (const value of Object.values(context.constants)) expect(Number.isFinite(value)).toBe(true);
    expect(context.scope).toEqual(
      expect.arrayContaining([...COMPANIES_HOUSE_CHECK.allowedPaths, "runs/run_ctx/**"]),
    );
    expect(context.scope).toContain("apps/console/tests/**");
    expect(context.base.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(context.audit_head.seq).toBeGreaterThan(0);
    expect(context.reverses).toBeNull();
  });

  it("hashes canonically: the same state yields the same SHA, a different run id does not", () => {
    const a = build();
    const b = build();
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.json).toBe(JSON.stringify(JSON.parse(a.json)));
    expect(build("run_other").sha256).not.toBe(a.sha256);
  });

  it("a REVERSAL copies the target's saved evidence verbatim, even when the record changed since", () => {
    const root = mkdtempSync(join(tmpdir(), "ctx-reversal-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root });
    git("init", "-q", "-b", "devin/test");
    git("commit", "-q", "--allow-empty", "-m", "init");

    // The original run's context, saved only under the data-dir copy: the
    // merged branch took the runs/ dir, exactly the fallback path dispatch
    // leaves behind for later reversals.
    const target = buildContext({
      runId: "run_target",
      kind: "IMPLEMENTATION/ADDITION",
      spec: COMPANIES_HOUSE_CHECK,
      scope: "rule",
      intent: "check",
      requestedBy: "admin",
      evidenceKey: CASE,
      evidenceIds: EVIDENCE,
      repoRoot: root,
    });
    const saved = JSON.parse(target.json) as ContextFile;
    saved.evidence.rows = [{ id: "kyc_since_closed", facts: { company: "Gone Ltd" } }];
    const dir = join(root, "apps", "console", "data", "runs", "run_target");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "context.json"), JSON.stringify(saved));

    // kyc_since_closed doesn't exist today, so a live read would throw. The
    // reversal must carry the original rows instead.
    const reversal = buildContext({
      runId: "run_rev",
      kind: "REVERSAL",
      spec: COMPANIES_HOUSE_CHECK,
      scope: "rule",
      intent: "undo the check",
      requestedBy: "admin",
      evidenceKey: CASE,
      evidenceIds: ["kyc_since_closed"],
      reverses: { runId: "run_target", mergeCommit: "f".repeat(40) },
      repoRoot: root,
    });
    expect(reversal.context.evidence.rows.map((r) => r.id)).toEqual(["kyc_since_closed"]);
    expect(reversal.context.reverses?.constants_at_dispatch).toEqual(saved.constants);
  });
});

describe("run files", () => {
  it("exports a JSON Schema for structured_output that mirrors the zod schema", () => {
    expect(STRUCTURED_OUTPUT_JSON_SCHEMA).toMatchObject({ type: "object" });
    const props = (STRUCTURED_OUTPUT_JSON_SCHEMA as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["phase", "verify_steps", "conflicts", "pr_url", "stopped_by"]),
    );
    expect(
      StructuredOutput.safeParse({
        phase: "verify",
        phase_status: "running",
        phase_durations_s: { intake: 4, baseline: 30 },
        base_commit: "c0ffee1234abcd",
        context_sha256: SHA,
        branch: "devin/run-1",
        plan_commit: null,
        reuses: [],
        files: [],
        verify_steps: [{ name: "pnpm test", pass: null, before: 130, after: null }],
        guards: [],
        conflicts: [],
        pr_url: null,
        stopped_by: null,
      }).success,
    ).toBe(true);
  });
});

describe("lifecycle", () => {
  it("dispatch → record_session → approve_pr → record_merge writes exactly four audit rows", () => {
    const run = applied(dispatch(kycManager));
    applied(act(kycManager, "record_session", run.id, { sessionId: "devin-life" }));
    expect(getRun(run.id)?.status).toBe("running");
    applied(
      act(secondEngineer, "approve_pr", run.id, { prUrl: PR, checksGreen: true, branchContextSha256: SHA }),
    );
    expect(getRun(run.id)).toMatchObject({ status: "approved", approvedBy: secondEngineer.id, prUrl: PR });
    const merged = applied(
      act(secondEngineer, "record_merge", run.id, { mergeCommit: "deadbeefcafe", prUrl: PR }),
    );
    expect(merged).toMatchObject({ status: "merged", mergeCommit: "deadbeefcafe", version: 4 });

    const rows = auditRowsFor(run.id);
    expect(rows.map((r) => r.action)).toEqual(["dispatch", "record_session", "approve_pr", "record_merge"]);
    expect(rows.every((r) => r.event === "applied")).toBe(true);

    const chain = verifyChain();
    expect(chain.ok).toBe(true);
    expect(chain.firstBreak).toBeNull();
  });
});
