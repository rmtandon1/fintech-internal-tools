import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { auditTrailFor } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor } from "@console/engine/types";
import {
  automationTool,
  type CreateSessionRequest,
  type DevinClient,
  type FetchLike,
  getRun,
  type GitHubClient,
  httpDevinClient,
  httpGitHubClient,
  IN_FLIGHT_STATUSES,
  parsePullUrl,
  REFUND_CLUSTERING_HOLD,
  type SessionSnapshot,
  type StructuredOutput,
} from "@console/tool-automation";
import {
  approveRun,
  type BridgeDeps,
  dispatchRun,
  isSynced,
  observeMerge,
  observeRun,
  pollRun,
  reconcileRuns,
  stopRun,
  syncMergedRun,
} from "@console/tool-automation/bridge";
import { db } from "@console/db";
import { kycTool } from "@console/tool-kyc";
import { devinRuns } from "@console/tool-automation/schema";
import { refundTool } from "@console/tool-refunds";
import { fakeGit } from "../helpers/fake-git";
import { admin, refundsAgent, refundsManager, setupHarness } from "../helpers/harness";

const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];
const PR = "https://github.com/rmtandon1/buy-v-build-cog-demo/pull/99";
const HEAD = "c".repeat(40);
const MERGE = "d".repeat(40);

let repoRoot: string;

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  repoRoot = mkdtempSync(join(tmpdir(), "bridge-repo-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repoRoot });
  git("init", "-q", "-b", "devin/test");
  git("commit", "-q", "--allow-empty", "-m", "init");
});

/** A Devin client that records calls and answers from a script. */
function fakeDevin(script: { create?: () => Promise<{ sessionId: string; url: string }>; snapshot?: SessionSnapshot }) {
  const calls: string[] = [];
  const created: CreateSessionRequest[] = [];
  const client: DevinClient = {
    async createSession(req) {
      calls.push("create");
      created.push(req);
      return script.create ? script.create() : { sessionId: "devin-abc", url: "https://app.devin.ai/sessions/abc" };
    },
    async getSession() {
      calls.push("get");
      if (!script.snapshot) throw new Error("no snapshot scripted");
      return script.snapshot;
    },
    async sendMessage(_id, message) {
      calls.push(`message:${message}`);
    },
    async terminateSession(id) {
      calls.push(`terminate:${id}`);
    },
  };
  return { client, calls, created };
}

function fakeGitHub(state: {
  merged?: boolean;
  green?: boolean;
  contextSha?: string | null;
}) {
  const calls: string[] = [];
  const client: GitHubClient = {
    async getPull() {
      calls.push("pull");
      return {
        headSha: HEAD,
        headRef: "devin/run",
        merged: state.merged ?? false,
        mergeCommit: state.merged ? MERGE : null,
      };
    },
    async getChecks() {
      calls.push("checks");
      return { green: state.green ?? true, summary: state.green === false ? "failed: verify" : "1 check run(s)" };
    },
    async fileSha256() {
      calls.push("file");
      return state.contextSha === undefined ? null : state.contextSha;
    },
    async approvePull() {
      calls.push("approve");
    },
  };
  return { client, calls };
}

function deps(over: Partial<BridgeDeps>): BridgeDeps {
  return { devin: null, github: null, repoRoot, now: () => 1_700_000_000_000, ...over };
}

const request = {
  spec: REFUND_CLUSTERING_HOLD.file,
  kind: "IMPLEMENTATION/ADDITION" as const,
  scope: "rule" as const,
  intent: REFUND_CLUSTERING_HOLD.intents["IMPLEMENTATION/ADDITION"] ?? "",
  clusterKey: "Kestrel Outdoors",
  evidenceIds: KESTREL,
};

function output(over: Partial<StructuredOutput> = {}): StructuredOutput {
  return {
    phase: "edit",
    phase_status: "running",
    phase_durations_s: { intake: 3 },
    base_commit: null,
    context_sha256: null,
    branch: "devin/run",
    plan_commit: null,
    reuses: [],
    files: [],
    verify_steps: [],
    guards: [],
    conflicts: [],
    pr_url: null,
    stopped_by: null,
    ...over,
  };
}

/** One run per tool: stop whatever the previous test left in flight. */
function stopAll() {
  const { rows } = automationTool.list({ filters: {}, limit: 100, offset: 0 });
  for (const row of rows) {
    if (!IN_FLIGHT_STATUSES.some((s) => s === row.status)) continue;
    executeIntent(admin, {
      tool: "automation",
      action: "stop",
      recordId: row.id,
      input: { reason: "cleanup" },
      idempotencyKey: ulid(),
    });
  }
}

describe("dispatchRun", () => {
  it("writes context.json, dispatches, creates the session with the context attached, then records it", async () => {
    stopAll();
    const devin = fakeDevin({});
    const out = await dispatchRun(refundsManager, request, deps({ devin: devin.client }));
    expect(out.dispatch.outcome.status).toBe("applied");
    expect(out.session?.outcome.status).toBe("applied");
    expect(out.sessionUrl).toBe("https://app.devin.ai/sessions/abc");

    const run = getRun(out.runId);
    expect(run?.status).toBe("running");
    expect(run?.sessionId).toBe("devin-abc");

    const contextPath = join(repoRoot, "runs", out.runId, "context.json");
    const json = readFileSync(contextPath, "utf8");
    expect(createHash("sha256").update(json).digest("hex")).toBe(run?.contextSha256);
    expect(json).not.toMatch(/@|\d{4}-\d{4}-\d{4}/);

    expect(devin.calls).toEqual(["create"]);
    const req = devin.created[0];
    expect(req.attachment).toEqual({ name: "context.json", body: json });
    expect(req.tags).toContain(`run:${out.runId}`);
    expect(req.structuredOutputSchema).toHaveProperty("properties");
    expect(req.prompt).toContain(request.intent);
    expect(req.prompt).toContain(".devin/run-protocol.playbook.md");
  });

  it("looks the playbook up when none is configured, and prefers a configured one", async () => {
    stopAll();
    const found = fakeDevin({});
    const lookups: string[] = [];
    const resolvePlaybookId = async () => {
      lookups.push("lookup");
      return "playbook-found";
    };
    await dispatchRun(refundsManager, request, deps({ devin: found.client, resolvePlaybookId }));
    expect(found.created[0].playbookId).toBe("playbook-found");

    stopAll();
    const configured = fakeDevin({});
    await dispatchRun(
      refundsManager,
      request,
      deps({ devin: configured.client, playbookId: "playbook-env", resolvePlaybookId }),
    );
    expect(configured.created[0].playbookId).toBe("playbook-env");
    expect(lookups).toEqual(["lookup"]);
  });

  it("still creates the session when the playbook lookup fails", async () => {
    stopAll();
    const devin = fakeDevin({});
    const out = await dispatchRun(
      refundsManager,
      request,
      deps({ devin: devin.client, resolvePlaybookId: () => Promise.reject(new Error("HTTP 500")) }),
    );
    expect(getRun(out.runId)?.status).toBe("running");
    expect(devin.created[0].playbookId).toBeUndefined();
  });

  it("records dispatch_failed with the error when the Devin API rejects the session", async () => {
    stopAll();
    const devin = fakeDevin({
      create: () => Promise.reject(new Error("Devin API 401 on /sessions: bad key")),
    });
    const out = await dispatchRun(refundsManager, request, deps({ devin: devin.client }));
    expect(out.dispatch.outcome.status).toBe("applied");
    const run = getRun(out.runId);
    expect(run?.status).toBe("dispatch_failed");
    expect(run?.lastNote).toContain("bad key");
    expect(run?.sessionId).toBeNull();
  });

  it("records dispatch_failed with dispatch and record_session audit rows when no Devin credentials are configured", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({}));
    expect(out.dispatch.outcome.status).toBe("applied");
    expect(out.session?.outcome.status).toBe("applied");
    expect(out.sessionUrl).toBeNull();
    const run = getRun(out.runId);
    expect(run?.status).toBe("dispatch_failed");
    expect(run?.sessionId).toBeNull();
    expect(run?.lastNote).toMatch(/DEVIN_API_KEY/);
    const trail = auditTrailFor("devin_run", out.runId);
    expect(trail.map((row) => row.action)).toEqual(["record_session", "dispatch"]);
  });

  it("never reaches Devin and leaves no run dir when the dispatch intent does not apply", async () => {
    stopAll();
    const devin = fakeDevin({});
    const out = await dispatchRun(refundsAgent, request, deps({ devin: devin.client }));
    expect(out.dispatch.outcome.status).toBe("error");
    expect(out.session).toBeNull();
    expect(devin.calls).toEqual([]);
    expect(existsSync(join(repoRoot, "runs", out.runId))).toBe(false);
    expect(getRun(out.runId)).toBeNull();
  });
});

describe("pollRun", () => {
  async function running() {
    stopAll();
    const devin = fakeDevin({});
    const out = await dispatchRun(admin, request, deps({ devin: devin.client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    return run;
  }

  it("returns the validated structured output and leaves devin_runs and runs/ untouched", async () => {
    const run = await running();
    const devin = fakeDevin({
      snapshot: { status: "working", statusDetail: "editing", structuredOutput: output() },
    });
    const out = await pollRun(run, deps({ devin: devin.client }));
    expect(out.kind).toBe("output");
    if (out.kind !== "output") throw new Error("unreachable");
    expect(out.status).toBe("working");
    expect(out.statusDetail).toBe("editing");
    expect(out.structuredOutput.phase).toBe("edit");
    expect(devin.calls).toEqual(["get"]);
    expect(readdirSync(join(repoRoot, "runs", run.id))).toEqual(["context.json"]);

    const after = getRun(run.id);
    expect(after?.version).toBe(run.version);
    expect(after?.updatedAt).toBe(run.updatedAt);
    expect(after?.status).toBe("running");
  });

  it("rejects malformed structured output", async () => {
    const run = await running();
    const devin = fakeDevin({
      snapshot: { status: "working", statusDetail: null, structuredOutput: { phase: "nonsense" } },
    });
    const out = await pollRun(run, deps({ devin: devin.client }));
    expect(out.kind).toBe("invalid_output");
  });

  it("reports a session without structured output yet", async () => {
    const run = await running();
    const devin = fakeDevin({ snapshot: { status: "running", statusDetail: null, structuredOutput: null } });
    const out = await pollRun(run, deps({ devin: devin.client }));
    expect(out).toEqual({ kind: "no_output", status: "running", statusDetail: null });
  });

  it("reports an unconfigured Devin API without touching the session", async () => {
    const run = await running();
    const out = await pollRun(run, deps({}));
    expect(out).toEqual({ kind: "unavailable", reason: "Devin API is not configured" });
  });
});

describe("observeRun", () => {
  async function running() {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    return run;
  }

  it("records the reported pull request once, then keeps it through a poll that omits it", async () => {
    const run = await running();
    const first = await observeRun(admin, run, deps({ devin: reportingPr().client }));
    expect(first.poll.kind).toBe("output");
    expect(first.record?.outcome.status).toBe("applied");

    const recorded = getRun(run.id);
    expect(recorded?.status).toBe("running");
    expect(recorded?.prUrl).toBe(PR);
    expect(recorded?.version).toBe(run.version + 1);
    expect(auditTrailFor("devin_run", run.id).map((row) => row.action)).toEqual([
      "record_pr",
      "record_session",
      "dispatch",
    ]);
    if (!recorded) throw new Error("no run");

    const again = await observeRun(admin, recorded, deps({ devin: reportingPr().client }));
    expect(again.record).toBeNull();
    const silent = fakeDevin({ snapshot: { status: "working", statusDetail: null, structuredOutput: null } });
    const third = await observeRun(admin, recorded, deps({ devin: silent.client }));
    expect(third.poll.kind).toBe("no_output");
    expect(third.record).toBeNull();
    expect(getRun(run.id)?.prUrl).toBe(PR);
    expect(getRun(run.id)?.version).toBe(run.version + 1);
  });

  it("records nothing while the session reports no pull request", async () => {
    const run = await running();
    const devin = fakeDevin({ snapshot: { status: "working", statusDetail: null, structuredOutput: output() } });
    const out = await observeRun(refundsManager, run, deps({ devin: devin.client }));
    expect(out.poll.kind).toBe("output");
    expect(out.record).toBeNull();
    expect(getRun(run.id)?.version).toBe(run.version);
  });

  it("skips recording for a manager outside the run's domain, so the next poller can still record", async () => {
    const run = await running();
    const kycManager: Actor = { id: "usr_kyc_mgr", name: "KYC manager", role: "kyc_manager" };
    const out = await observeRun(kycManager, run, deps({ devin: reportingPr().client }));
    expect(out.record).toBeNull();
    expect(getRun(run.id)?.prUrl).toBeNull();
    expect(getRun(run.id)?.version).toBe(run.version);

    const next = await observeRun(admin, run, deps({ devin: reportingPr().client }));
    expect(next.record?.outcome.status).toBe("applied");
    expect(getRun(run.id)?.prUrl).toBe(PR);
  });

  it("record_pr denies a repeat under a fresh key, same URL or not, without a new version", async () => {
    const run = await running();
    await observeRun(admin, run, deps({ devin: reportingPr().client }));
    const recorded = getRun(run.id);
    for (const prUrl of [PR, "https://github.com/rmtandon1/buy-v-build-cog-demo/pull/100"]) {
      const again = executeIntent(admin, {
        tool: "automation",
        action: "record_pr",
        recordId: run.id,
        input: { prUrl },
        idempotencyKey: ulid(),
      });
      expect(again.outcome.status).toBe("denied");
    }
    expect(getRun(run.id)?.prUrl).toBe(PR);
    expect(getRun(run.id)?.version).toBe(recorded?.version);
    const rows = auditTrailFor("devin_run", run.id).filter((row) => row.action === "record_pr");
    expect(rows.map((row) => row.event)).toEqual(["denied", "denied", "applied"]);
  });
});

/** A Devin client whose session reports `PR` as its pull request. */
function reportingPr() {
  return fakeDevin({
    snapshot: {
      status: "working",
      statusDetail: null,
      structuredOutput: output({ phase: "pull_request", pr_url: PR }),
    },
  });
}

describe("approveRun", () => {
  async function runningWithPr() {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    return run;
  }

  it("reads the PR from the session and the checks and branch digest from GitHub, applies approve_pr, then submits the review", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256 });
    const devin = reportingPr();
    const out = await approveRun(engineer, run, "lgtm", deps({ github: github.client, devin: devin.client }));
    expect(out.approve.outcome.status).toBe("applied");
    expect(out.reviewError).toBeNull();
    expect(github.calls).toEqual(["pull", "checks", "file", "approve"]);
    expect(devin.calls).toEqual(["get", `message:Run ${run.id} is approved. Merge ${PR} now.`]);
    const after = getRun(run.id);
    expect(after?.status).toBe("approved");
    expect(after?.prUrl).toBe(PR);
    expect(after?.approvedBy).toBe(engineer.id);
    expect(auditTrailFor("devin_run", run.id).map((row) => row.action)).toEqual([
      "approve_pr",
      "record_pr",
      "record_session",
      "dispatch",
    ]);
  });

  it("denies when checks are not green and submits no review", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: false, contextSha: run.contextSha256 });
    const out = await approveRun(engineer, run, undefined, deps({ github: github.client, devin: reportingPr().client }));
    expect(out.approve.outcome.status).toBe("denied");
    expect(out.checks).toContain("failed");
    expect(github.calls).not.toContain("approve");
    expect(getRun(run.id)?.status).toBe("running");
  });

  it("denies when the branch context.json digest differs from the dispatched one", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: "e".repeat(64) });
    const out = await approveRun(engineer, run, undefined, deps({ github: github.client, devin: reportingPr().client }));
    expect(out.approve.outcome.status).toBe("denied");
    expect(github.calls).not.toContain("approve");
  });

  it("denies when the branch has no context.json at all", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: null });
    const out = await approveRun(engineer, run, undefined, deps({ github: github.client, devin: reportingPr().client }));
    expect(out.approve.outcome.status).toBe("denied");
    expect(github.calls).not.toContain("approve");
  });

  it("denies a non-engineer before touching the review endpoint", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256 });
    const out = await approveRun(refundsManager, run, undefined, deps({ github: github.client, devin: reportingPr().client }));
    expect(out.approve.outcome.status).not.toBe("applied");
    expect(github.calls).not.toContain("approve");
  });

  it("refuses without a reported pull request or GitHub credentials", async () => {
    const run = await runningWithPr();
    const silent = fakeDevin({ snapshot: { status: "working", statusDetail: null, structuredOutput: output() } });
    await expect(
      approveRun(engineer, run, undefined, deps({ github: fakeGitHub({}).client, devin: silent.client })),
    ).rejects.toThrow(/not reported a pull request/);
    await expect(approveRun(engineer, run, undefined, deps({ github: fakeGitHub({}).client }))).rejects.toThrow(
      /not reported a pull request/,
    );
    await expect(approveRun(engineer, run, undefined, deps({ devin: reportingPr().client }))).rejects.toThrow(
      /GITHUB_TOKEN/,
    );
  });
});

describe("observeMerge and stopRun", () => {
  async function approved() {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256 });
    await approveRun(engineer, run, undefined, deps({ github: github.client, devin: reportingPr().client }));
    const after = getRun(run.id);
    if (!after) throw new Error("no run");
    return after;
  }

  it("records the merge only once GitHub reports the PR merged", async () => {
    const run = await approved();
    const open = await observeMerge(admin, run, deps({ github: fakeGitHub({ merged: false }).client }));
    expect(open).toEqual({ kind: "open", prUrl: PR });
    expect(getRun(run.id)?.status).toBe("approved");

    const merged = await observeMerge(admin, run, deps({ github: fakeGitHub({ merged: true }).client }));
    expect(merged.kind).toBe("merged");
    const after = getRun(run.id);
    expect(after?.status).toBe("merged");
    expect(after?.mergeCommit).toBe(MERGE);
    expect(after?.prUrl).toBe(PR);
  });

  it("builds a reversal's context from the merged run's cluster, not the caller's", async () => {
    const run = await approved();
    await observeMerge(admin, run, deps({ github: fakeGitHub({ merged: true }).client }));
    const devin = fakeDevin({});
    const out = await dispatchRun(
      admin,
      {
        ...request,
        kind: "REVERSAL",
        intent: REFUND_CLUSTERING_HOLD.intents.REVERSAL ?? "",
        clusterKey: "Forged Merchant",
        evidenceIds: [],
        reverses: run.id,
      },
      deps({ devin: devin.client }),
    );
    expect(out.dispatch.outcome.status).toBe("applied");
    const context = JSON.parse(readFileSync(join(repoRoot, "runs", out.runId, "context.json"), "utf8"));
    expect(context.evidence.cluster).toBe(`${REFUND_CLUSTERING_HOLD.evidence.cluster}:Kestrel Outdoors`);
    expect(context.reverses).toMatchObject({ run_id: run.id, merge_commit: MERGE });
    expect(getRun(out.runId)?.reverses).toBe(run.id);
  });

  it("terminates the Devin session, then records stop", async () => {
    const run = await approved();
    const devin = fakeDevin({});
    const out = await stopRun(admin, run, "operator halted", deps({ devin: devin.client }));
    expect(out.stop.outcome.status).toBe("applied");
    expect(out.terminateError).toBeNull();
    expect(devin.calls).toEqual([`terminate:${run.sessionId}`]);
    expect(getRun(run.id)?.status).toBe("stopped");
  });

  it("does not terminate a session for a stop the policy denies", async () => {
    const run = await approved();
    const devin = fakeDevin({});
    const out = await stopRun(refundsAgent, run, "nope", deps({ devin: devin.client }));
    expect(out.stop.outcome.status).not.toBe("applied");
    expect(devin.calls).toEqual([]);
    expect(getRun(run.id)?.status).toBe("approved");
  });
});

describe("syncMergedRun", () => {
  async function merged() {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    let run = getRun(out.runId);
    if (!run) throw new Error("no run");
    await approveRun(
      engineer,
      run,
      undefined,
      deps({ github: fakeGitHub({ contextSha: run.contextSha256 }).client, devin: reportingPr().client }),
    );
    run = getRun(run.id);
    if (!run) throw new Error("no run");
    const observed = await observeMerge(admin, run, deps({ github: fakeGitHub({ merged: true }).client }));
    expect(observed.kind).toBe("merged");
    const after = getRun(run.id);
    if (!after || after.status !== "merged") throw new Error("run did not merge");
    return after;
  }

  const BEFORE = "a".repeat(40);
  const AFTER = "b".repeat(40);

  it("skips when no git runner is configured", async () => {
    const run = await merged();
    const out = await syncMergedRun(run, deps({}));
    expect(out).toEqual({ kind: "skipped", reason: "git sync not configured" });
  });

  it("skips a run that is not merged", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    const fake = fakeGit({});
    const sync = await syncMergedRun(run, deps({ git: fake.git }));
    expect(sync.kind).toBe("skipped");
    expect(fake.calls).toEqual([]);
  });

  it("skips when the checkout is not on the sync branch", async () => {
    const run = await merged();
    const fake = fakeGit({ branch: "devin/run" });
    const sync = await syncMergedRun(run, deps({ git: fake.git }));
    expect(sync).toEqual({ kind: "skipped", reason: "checkout is not on cognition-dashboard-devin-integration" });
    expect(fake.calls).not.toContain("status");
  });

  it("skips a modified tracked file so uncommitted edits are never clobbered", async () => {
    const run = await merged();
    const fake = fakeGit({ status: [{ path: "tools/refunds/src/index.ts", untracked: false }] });
    const sync = await syncMergedRun(run, deps({ git: fake.git }));
    expect(sync).toEqual({ kind: "skipped", reason: "working tree has uncommitted changes" });
    expect(fake.calls.some((c) => c.startsWith("pull:"))).toBe(false);
  });

  it("skips an unrelated untracked file", async () => {
    const run = await merged();
    const fake = fakeGit({ status: [{ path: "notes.txt", untracked: true }] });
    const sync = await syncMergedRun(run, deps({ git: fake.git }));
    expect(sync).toEqual({ kind: "skipped", reason: "working tree has uncommitted changes" });
  });

  it("deletes a merged run's untracked context.json so the pull can land it", async () => {
    const run = await merged();
    // dispatchRun already wrote the byte-identical runs/<id>/context.json into repoRoot.
    const rel = `runs/${run.id}/context.json`;
    expect(existsSync(join(repoRoot, rel))).toBe(true);
    const fake = fakeGit({
      status: [{ path: rel, untracked: true }],
      before: BEFORE,
      after: AFTER,
      ancestors: [MERGE],
    });
    const sync = await syncMergedRun(run, deps({ git: fake.git, migrationsPending: async () => false }));
    expect(sync).toEqual({ kind: "synced", before: BEFORE, after: AFTER, migrated: false });
    expect(fake.removed).toEqual([rel]);
  });

  it("leaves an untracked context.json whose bytes do not match the run's digest", async () => {
    const run = await merged();
    const rel = `runs/${run.id}/context.json`;
    writeFileSync(join(repoRoot, rel), "{}", "utf8");
    const fake = fakeGit({
      status: [{ path: rel, untracked: true }],
      before: BEFORE,
      after: AFTER,
      ancestors: [MERGE],
    });
    const original = readFileSync(join(repoRoot, rel), "utf8");
    writeFileSync(join(repoRoot, rel), "{}", "utf8");
    const sync = await syncMergedRun(run, deps({ git: fake.git, migrationsPending: async () => false }));
    expect(fake.removed).toEqual([]);
    expect(fake.calls.some((c) => c.startsWith("pull:"))).toBe(true);
    expect(sync.kind).toBe("synced");
    writeFileSync(join(repoRoot, rel), original, "utf8");
  });

  it("fails when the pulled HEAD does not contain the merge commit", async () => {
    const run = await merged();
    const fake = fakeGit({ before: BEFORE, after: AFTER, ancestors: [] });
    const sync = await syncMergedRun(run, deps({ git: fake.git }));
    expect(sync.kind).toBe("failed");
    if (sync.kind === "failed") expect(sync.reason).toContain(MERGE.slice(0, 12));
  });

  it("runs db:migrate only while migrations are pending", async () => {
    const run = await merged();
    const migrated: string[] = [];
    let pending = true;
    const sync = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE] }).git,
        migrate: async (cwd) => void migrated.push(cwd),
        migrationsPending: async () => pending,
      }),
    );
    expect(sync).toEqual({ kind: "synced", before: BEFORE, after: AFTER, migrated: true });
    expect(migrated).toEqual([repoRoot]);

    pending = false;
    const again = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE] }).git,
        migrate: async (cwd) => void migrated.push(cwd),
        migrationsPending: async () => pending,
      }),
    );
    expect(again).toEqual({ kind: "synced", before: BEFORE, after: AFTER, migrated: false });
    expect(migrated).toEqual([repoRoot]);
  });

  it("retries a failed migration on the next call even when the pull advances nothing", async () => {
    const run = await merged();
    const migrated: string[] = [];
    const first = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE] }).git,
        migrate: async () => {
          throw new Error("SQLITE_BUSY");
        },
        migrationsPending: async () => true,
      }),
    );
    expect(first.kind).toBe("failed");
    if (first.kind === "failed") expect(first.reason).toContain("SQLITE_BUSY");

    const second = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: AFTER, ancestors: [MERGE] }).git,
        migrate: async (cwd) => void migrated.push(cwd),
        migrationsPending: async () => true,
      }),
    );
    expect(second).toEqual({ kind: "synced", before: AFTER, after: AFTER, migrated: true });
    expect(migrated).toEqual([repoRoot]);
  });

  it("reports unchanged only when neither HEAD nor migrations moved", async () => {
    const run = await merged();
    const fake = fakeGit({ before: BEFORE, ancestors: [MERGE] });
    const sync = await syncMergedRun(run, deps({ git: fake.git, migrationsPending: async () => false }));
    expect(sync).toEqual({ kind: "unchanged", head: BEFORE });
  });

  it("isSynced stays false while migrations are pending", async () => {
    const run = await merged();
    let pending = true;
    const d = deps({
      git: fakeGit({ ancestors: [MERGE] }).git,
      migrationsPending: async () => pending,
    });
    expect(await isSynced(run, d)).toBe(false);
    pending = false;
    expect(await isSynced(run, d)).toBe(true);
  });
});

describe("reconcileRuns", () => {
  async function approved() {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    await approveRun(
      engineer,
      run,
      undefined,
      deps({ github: fakeGitHub({ contextSha: run.contextSha256 }).client, devin: reportingPr().client }),
    );
    const after = getRun(run.id);
    if (!after || after.status !== "approved") throw new Error("run not approved");
    return after;
  }

  it("records nothing while GitHub says the PR is open", async () => {
    const run = await approved();
    const fake = fakeGit({ ancestors: [MERGE] });
    const out = await reconcileRuns(engineer, deps({ github: fakeGitHub({ merged: false }).client, git: fake.git }));
    expect(out).toEqual({ checked: 1, merged: 0, sync: null });
    expect(getRun(run.id)?.status).toBe("approved");
    expect(fake.calls).toEqual([]);
  });

  it("records one record_merge per merged run and pulls once", async () => {
    const run = await approved();
    const fake = fakeGit({ after: "b".repeat(40), ancestors: [MERGE] });
    const out = await reconcileRuns(engineer, deps({ github: fakeGitHub({ merged: true }).client, git: fake.git }));
    expect(out.checked).toBe(1);
    expect(out.merged).toBe(1);
    expect(out.sync?.kind).toBe("synced");
    const after = getRun(run.id);
    if (!after) throw new Error("no run");
    expect(after.status).toBe("merged");
    expect(after.mergeCommit).toBe(MERGE);
    expect(fake.calls.some((c) => c.startsWith("pull:origin/cognition-dashboard-devin-integration"))).toBe(true);

    // A second look at the same merge replays the idempotent intent instead of writing again.
    const again = await observeMerge(engineer, after, deps({ github: fakeGitHub({ merged: true }).client }));
    expect(again).toMatchObject({ kind: "merged" });
    if (again.kind === "merged") expect(again.record.replayed).toBe(true);

    // And a second reconcile has nothing approved left to check.
    const second = await reconcileRuns(engineer, deps({ github: fakeGitHub({ merged: true }).client, git: fake.git }));
    expect(second).toEqual({ checked: 0, merged: 0, sync: null });
  });

  it("pages through every approved run before transitioning any of them", async () => {
    stopAll();
    // One run per tool is in flight, so approved runs past the first come from
    // direct inserts — the list query is what is under test, not dispatch.
    const first = await approved();
    const ids = [first.id];
    for (let i = 0; i < 2; i++) {
      const id = ulid();
      db.insert(devinRuns)
        .values({
          id,
          kind: "IMPLEMENTATION/ADDITION",
          spec: REFUND_CLUSTERING_HOLD.file,
          tool: "refunds",
          scope: "rule",
          intent: "seeded approved run",
          contextSha256: "f".repeat(64),
          sessionId: null,
          status: "approved",
          prUrl: PR,
          mergeCommit: null,
          reverses: null,
          requestedBy: admin.id,
          requestedByRole: admin.role,
          approvedBy: engineer.id,
          lastNote: null,
          requestedAt: 1,
          updatedAt: 1,
          version: 1,
        })
        .run();
      ids.push(id);
    }
    const fake = fakeGit({ after: "b".repeat(40), ancestors: [MERGE] });
    const out = await reconcileRuns(
      engineer,
      deps({ github: fakeGitHub({ merged: true }).client, git: fake.git }),
      2,
    );
    expect(out.checked).toBe(3);
    expect(out.merged).toBe(3);
    expect(out.sync?.kind).toBe("synced");
    for (const id of ids) expect(getRun(id)?.status).toBe("merged");
  });
});

describe("HTTP clients", () => {
  function recorder(routes: Record<string, (init?: RequestInit) => unknown>) {
    const seen: { url: string; method: string; body: string | null }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      const method = init?.method ?? "GET";
      seen.push({ url, method, body: typeof init?.body === "string" ? init.body : null });
      const route = Object.entries(routes).find(([k]) => `${method} ${url}`.includes(k));
      if (!route) return new Response("not found", { status: 404 });
      const body = route[1](init);
      return new Response(body === undefined ? "" : JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    return { fetchImpl, seen };
  }

  it("Devin client uploads the attachment, then creates the session with the schema", async () => {
    const http = recorder({
      "POST https://api.devin.ai/v3/organizations/org_1/attachments": () => ({ url: "https://files/ctx" }),
      "POST https://api.devin.ai/v3/organizations/org_1/sessions": () => ({
        session_id: "devin-1",
        url: "https://app.devin.ai/sessions/1",
        status: "running",
      }),
      "GET https://api.devin.ai/v3/organizations/org_1/sessions/devin-1": () => ({
        session_id: "devin-1",
        status: "blocked",
        status_detail: "waiting",
        structured_output: { phase: "plan" },
      }),
      "DELETE https://api.devin.ai/v3/organizations/org_1/sessions/devin-1": () => undefined,
    });
    const client = httpDevinClient({ apiKey: "k", orgId: "org_1" }, http.fetchImpl);
    const created = await client.createSession({
      prompt: "p",
      title: "t",
      tags: ["run:1"],
      attachment: { name: "context.json", body: "{}" },
      structuredOutputSchema: { type: "object" },
    });
    expect(created).toEqual({ sessionId: "devin-1", url: "https://app.devin.ai/sessions/1" });
    expect(http.seen.map((s) => s.method)).toEqual(["POST", "POST"]);
    const sessionBody = JSON.parse(http.seen[1].body ?? "{}");
    expect(sessionBody.attachment_urls).toEqual(["https://files/ctx"]);
    expect(sessionBody.structured_output_required).toBe(true);
    expect(sessionBody.structured_output_schema).toEqual({ type: "object" });

    const snap = await client.getSession("devin-1");
    expect(snap).toEqual({ status: "blocked", statusDetail: "waiting", structuredOutput: { phase: "plan" } });
    await client.terminateSession("devin-1");
    expect(http.seen.at(-1)?.method).toBe("DELETE");
  });

  it("Devin client surfaces API errors with status and path", async () => {
    const fetchImpl: FetchLike = async () => new Response("nope", { status: 403 });
    const client = httpDevinClient({ apiKey: "k", orgId: "org_1" }, fetchImpl);
    await expect(client.getSession("x")).rejects.toThrow(/Devin API 403 .*sessions\/x: nope/);
  });

  it("GitHub client reads combined checks, hashes the branch file and approves at the head sha", async () => {
    const context = '{"run_id":"r"}';
    const http = recorder({
      "GET https://api.github.com/repos/o/r/pulls/7": () => ({
        head: { sha: HEAD, ref: "devin/run" },
        merged: true,
        merge_commit_sha: MERGE,
      }),
      [`GET https://api.github.com/repos/o/r/commits/${HEAD}/check-runs`]: () => ({
        check_runs: [
          { name: "verify", status: "completed", conclusion: "success" },
          { name: "lint", status: "in_progress", conclusion: null },
        ],
      }),
      [`GET https://api.github.com/repos/o/r/commits/${HEAD}/status`]: () => ({ state: "pending", total_count: 0 }),
      [`GET https://api.github.com/repos/o/r/contents/runs/r/context.json?ref=${HEAD}`]: () => ({
        encoding: "base64",
        content: Buffer.from(context).toString("base64"),
      }),
      "POST https://api.github.com/repos/o/r/pulls/7/reviews": () => ({ state: "APPROVED" }),
    });
    const client = httpGitHubClient("tok", http.fetchImpl);
    const ref = parsePullUrl("https://github.com/o/r/pull/7");
    if (!ref) throw new Error("parse failed");
    expect(ref).toEqual({ owner: "o", repo: "r", number: 7 });

    const pull = await client.getPull(ref);
    expect(pull).toEqual({ headSha: HEAD, headRef: "devin/run", merged: true, mergeCommit: MERGE });
    const checks = await client.getChecks(ref, HEAD);
    expect(checks.green).toBe(false);
    expect(checks.summary).toContain("pending: lint");
    expect(await client.fileSha256(ref, HEAD, "runs/r/context.json")).toBe(
      createHash("sha256").update(context).digest("hex"),
    );
    expect(await client.fileSha256(ref, HEAD, "runs/missing/context.json")).toBeNull();
    await client.approvePull(ref, HEAD, "ok");
    const review = JSON.parse(http.seen.at(-1)?.body ?? "{}");
    expect(review).toMatchObject({ commit_id: HEAD, event: "APPROVE" });
    expect(http.seen.every((s) => s.url.startsWith("https://api.github.com/"))).toBe(true);
  });

  it("parsePullUrl rejects anything that is not a github.com pull request", () => {
    expect(parsePullUrl("https://github.com/o/r/pulls")).toBeNull();
    expect(parsePullUrl("https://gitlab.com/o/r/pull/1")).toBeNull();
    expect(parsePullUrl("https://github.com/o/r/pull/12/files")).toEqual({ owner: "o", repo: "r", number: 12 });
  });

  it("the global fetch is disabled under test", async () => {
    await expect(async () => fetch("https://api.devin.ai/v3")).rejects.toThrow(/Live HTTP is disabled/);
  });
});
