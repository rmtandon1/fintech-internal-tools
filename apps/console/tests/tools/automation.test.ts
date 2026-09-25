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
  REFUND_CLUSTERING_HOLD,
  STRUCTURED_OUTPUT_JSON_SCHEMA,
  StructuredOutput,
  type DevinRun,
} from "@console/tool-automation";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { admin, kycManager, refundsAgent, refundsManager, setupHarness } from "../helpers/harness";

const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };
const secondEngineer: Actor = { id: "usr_engineer_2", name: "Engineer 2", role: "engineer" };

const SHA = "a".repeat(64);
const OTHER_SHA = "b".repeat(64);
const PR = "https://github.com/rmtandon1/buy-v-build-cog-demo/pull/99";
/** The four Kestrel Outdoors not_received refunds the seed ships. */
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
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
    spec: REFUND_CLUSTERING_HOLD.file,
    kind: "IMPLEMENTATION/ADDITION",
    scope: "rule",
    intent: REFUND_CLUSTERING_HOLD.intents["IMPLEMENTATION/ADDITION"],
    contextSha256: SHA,
    evidenceIds: KESTREL,
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
  it("role_may_start_kind: the refunds manager may start an ADDITION of a refunds spec", () => {
    const run = applied(dispatch(refundsManager));
    expect(run).toMatchObject({
      status: "dispatched",
      kind: "IMPLEMENTATION/ADDITION",
      tool: "refunds",
      scope: "rule",
      contextSha256: SHA,
      requestedBy: refundsManager.id,
      reverses: null,
    });
    stop(run);
  });

  it("role_may_start_kind: a manager of another domain is denied", () => {
    deniedBy(dispatch(kycManager), "role_may_start_kind");
  });

  it("role_may_start_kind: only the admin may start a REVERSAL", () => {
    const merged = merge(applied(dispatch(admin)));
    deniedBy(
      dispatch(refundsManager, { kind: "REVERSAL", reverses: merged.id, evidenceIds: [] }),
      "role_may_start_kind",
    );
    const reversal = applied(
      dispatch(admin, {
        kind: "REVERSAL",
        reverses: merged.id,
        evidenceIds: [],
        intent: REFUND_CLUSTERING_HOLD.intents.REVERSAL,
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
    deniedBy(dispatch(refundsManager, { scope: "engine" }), "engine_scope_admin_only");
    const run = applied(dispatch(admin, { scope: "engine" }));
    expect(run.scope).toBe("engine");
    stop(run);
  });

  it("no_run_in_flight_on_tool: a second run against the same tool is denied until the first ends", () => {
    const first = applied(dispatch(refundsManager));
    deniedBy(dispatch(admin), "no_run_in_flight_on_tool");
    applied(act(refundsManager, "record_session", first.id, { sessionId: "devin-abc" }));
    deniedBy(dispatch(admin), "no_run_in_flight_on_tool");
    stop(first);
    const second = applied(dispatch(admin));
    stop(second);
  });

  it("no_run_in_flight_on_tool: a failed dispatch does not hold the tool", () => {
    const failed = applied(dispatch(refundsManager));
    applied(act(refundsManager, "record_session", failed.id, { error: "Devin API 503" }));
    expect(getRun(failed.id)?.status).toBe("dispatch_failed");
    const next = applied(dispatch(refundsManager));
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
    deniedBy(dispatch(refundsManager, { evidenceIds: [] }), "implementation_carries_evidence");
  });

  it("actor_owns_run_domain: a manager of another domain cannot record or stop a refunds run", () => {
    const run = applied(dispatch(refundsManager));
    deniedBy(act(kycManager, "record_session", run.id, { sessionId: "devin-x" }), "actor_owns_run_domain");
    deniedBy(act(kycManager, "stop", run.id, { reason: "not mine" }), "actor_owns_run_domain");
    expect(getRun(run.id)?.status).toBe("dispatched");
    stop(run, refundsManager);
  });

  it("audits the context SHA and spec, never the context body", () => {
    const run = applied(dispatch(refundsManager));
    const [row] = auditRowsFor(run.id);
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    expect(payload).toMatchObject({ spec: REFUND_CLUSTERING_HOLD.file, contextSha256: SHA });
    expect(Object.keys(payload)).not.toContain("evidence");
    expect(Object.keys(payload)).not.toContain("constants");
    stop(run);
  });
});

describe("approve_pr", () => {
  function running(requester: Actor = refundsManager): DevinRun {
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
    const run = applied(dispatch(refundsManager));
    expect(act(engineer, "approve_pr", run.id, green).outcome).toMatchObject({ code: "invalid_status" });
    stop(run);
  });
});

describe("context.json", () => {
  function build(runId = "run_ctx") {
    return buildContext({
      runId,
      kind: "IMPLEMENTATION/ADDITION",
      spec: REFUND_CLUSTERING_HOLD,
      scope: "rule",
      intent: REFUND_CLUSTERING_HOLD.intents["IMPLEMENTATION/ADDITION"] ?? "",
      requestedBy: "refunds_manager",
      clusterKey: "Kestrel Outdoors",
      evidenceIds: KESTREL,
      repoRoot: process.cwd(),
    });
  }

  it("carries only allowlisted evidence columns and no email- or card-like keys", () => {
    const { context, json } = build();
    expect(context.evidence.rows).toHaveLength(KESTREL.length);
    for (const row of context.evidence.rows) {
      expect(Object.keys(row).sort()).toEqual(["id", "merchant", "reasonCode", "requestedAt", "usdMinor"]);
    }
    expect(json).not.toMatch(/email|card|last4|@/i);
    expect(ContextFile.parse(context)).toEqual(context);
  });

  it("refuses evidence ids the live cluster does not contain", () => {
    expect(() =>
      buildContext({
        runId: "run_stray",
        kind: "IMPLEMENTATION/ADDITION",
        spec: REFUND_CLUSTERING_HOLD,
        scope: "rule",
        intent: "x",
        requestedBy: "admin",
        clusterKey: "Kestrel Outdoors",
        evidenceIds: [...KESTREL, "rfnd_0001"],
      }),
    ).toThrow(/not in cluster Kestrel Outdoors: rfnd_0001/);
    expect(() =>
      buildContext({
        runId: "run_nogroup",
        kind: "IMPLEMENTATION/ADDITION",
        spec: REFUND_CLUSTERING_HOLD,
        scope: "rule",
        intent: "x",
        requestedBy: "admin",
        clusterKey: "No Such Merchant",
        evidenceIds: KESTREL,
      }),
    ).toThrow(/has no group No Such Merchant/);
  });

  it("snapshots the spec's constants, the scope globs, the base commit and the audit head", () => {
    const { context } = build();
    expect(Object.keys(context.constants).sort()).toEqual(
      [...REFUND_CLUSTERING_HOLD.constantKeys].sort(),
    );
    for (const value of Object.values(context.constants)) expect(Number.isFinite(value)).toBe(true);
    expect(context.scope).toEqual(
      expect.arrayContaining([...REFUND_CLUSTERING_HOLD.allowedPaths, "runs/run_ctx/**"]),
    );
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
        conflicts: [],
        pr_url: null,
        stopped_by: null,
      }).success,
    ).toBe(true);
  });
});

describe("lifecycle", () => {
  it("dispatch → record_session → approve_pr → record_merge writes exactly four audit rows", () => {
    const run = applied(dispatch(refundsManager));
    applied(act(refundsManager, "record_session", run.id, { sessionId: "devin-life" }));
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
