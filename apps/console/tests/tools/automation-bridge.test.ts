import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ulid } from "ulid";
import { auditTrailFor } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor } from "@console/engine/types";
import {
  type ApprovingReview,
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
  CHARGEBACKS_FROM_POWER_APPS,
  COMPANIES_HOUSE_CHECK,
  type SessionSnapshot,
  type StructuredOutput,
} from "@console/tool-automation";
import {
  approveRun,
  type BridgeDeps,
  describeGitHubApproval,
  describeSync,
  dispatchRun,
  isSynced,
  observeGitHubApproval,
  observeMerge,
  prClosedReason,
  observeRun,
  pollRun,
  readReplay,
  reconcileRuns,
  runPrompt,
  stopRun,
  syncMergedRun,
} from "@console/tool-automation/bridge";
import { listExport } from "@console/tool-automation/context";
import { db } from "@console/db";
import { kycTool } from "@console/tool-kyc";
import { devinRuns } from "@console/tool-automation/schema";
import { refundTool } from "@console/tool-refunds";
import { handleGet, type RunViewPayload } from "@/lib/devin-route";
import { fakeGit } from "../helpers/fake-git";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim();
const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };
const CASE = ["kyc_0003"];
const PR = "https://github.com/rmtandon1/buy-v-build-cog-demo/pull/99";
const HEAD = "c".repeat(40);
const MERGE = "d".repeat(40);

let repoRoot: string;

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
  repoRoot = mkdtempSync(join(tmpdir(), "bridge-repo-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repoRoot });
  git("init", "-q", "-b", "devin/test");
  git("commit", "-q", "--allow-empty", "-m", "init");
});

/** A Devin client that records calls and answers from a script. */
function fakeDevin(script: {
  create?: () => Promise<{ sessionId: string; url: string }>;
  snapshot?: SessionSnapshot;
  messageFails?: boolean;
}) {
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
      if (script.messageFails) throw new Error("Devin API 503 on /sessions/abc/messages: unavailable");
    },
    async terminateSession(id) {
      calls.push(`terminate:${id}`);
    },
  };
  return { client, calls, created };
}

function fakeGitHub(state: {
  merged?: boolean;
  /** The login GitHub reports merged the PR. */
  mergedBy?: string | null;
  /** Closed on GitHub; a merged PR is closed too. */
  closed?: boolean;
  green?: boolean;
  contextSha?: string | null;
  approved?: boolean;
  reviewFails?: boolean;
  /** Approving reviews GitHub lists at the head sha, beyond the console's own. */
  reviews?: ApprovingReview[];
}) {
  const calls: string[] = [];
  const client: GitHubClient = {
    async getPull() {
      calls.push("pull");
      return {
        headSha: HEAD,
        headRef: "devin/run",
        state: state.merged || state.closed ? "closed" : "open",
        merged: state.merged ?? false,
        mergeCommit: state.merged ? MERGE : null,
        mergedBy: state.merged ? (state.mergedBy ?? null) : null,
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
      if (state.reviewFails) throw new Error("GitHub API 403 on /pulls/99/reviews: Resource not accessible by personal access token");
      state.approved = true;
    },
    async hasApprovingReview() {
      calls.push("reviews");
      return state.approved ?? false;
    },
    async listApprovingReviews() {
      calls.push("list-reviews");
      return [
        // The console posts its review as the token's owner — the same login the engineer maps to.
        ...(state.approved ? [{ login: "rmtandon1", submittedAt: "2026-01-01T00:00:00Z", body: CONSOLE_REVIEW }] : []),
        ...(state.reviews ?? []),
      ];
    },
  };
  return { client, calls };
}

const CONSOLE_REVIEW = "Approved from the ops console for run x (context 000000000000).";

function deps(over: Partial<BridgeDeps>): BridgeDeps {
  return { devin: null, github: null, repoRoot, now: () => 1_700_000_000_000, ...over };
}

const request = {
  spec: COMPANIES_HOUSE_CHECK.file,
  operation: "change" as const,
  intent: COMPANIES_HOUSE_CHECK.intents.change,
  evidenceKey: "kyc_0003",
  evidenceIds: CASE,
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
    const out = await dispatchRun(manager, request, deps({ devin: devin.client }));
    expect(out.dispatch.outcome.status).toBe("applied");
    expect(out.session?.outcome.status).toBe("applied");
    expect(out.sessionUrl).toBe("https://app.devin.ai/sessions/abc");

    const run = getRun(out.runId);
    expect(run?.status).toBe("running");
    expect(run?.sessionId).toBe("devin-abc");
    expect(run?.sessionUrl).toBe("https://app.devin.ai/sessions/abc");

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
    expect(req.prompt).toContain(`Operation: change. Run: ${out.runId}.`);
    expect(req.prompt).not.toContain("COMPANIES_HOUSE_CHECK");
    expect(req.title).not.toContain("COMPANIES_HOUSE_CHECK");
    expect(req.prompt).toContain(".devin/run-protocol.playbook.md");
    expect(req.prompt).toContain("1. Intake\n2. Baseline\n3. Plan\n4. Edit\n5. Verify\n6. Pull request\n7. Merge");
    expect(req.prompt).toContain('"Step N of 7 complete: <step>: <one-line result>"');
    expect(req.title).not.toContain(out.runId);
    expect(req.title).not.toMatch(/\.$/);
    expect(req.prompt).not.toContain("Repository:");
  });

  it("names the spec only when the spec opts in to being sent", async () => {
    stopAll();
    cpSync(
      join(REPO_ROOT, "fixtures/power-apps/chargebacks"),
      join(repoRoot, "fixtures/power-apps/chargebacks"),
      { recursive: true },
    );
    const devin = fakeDevin({});
    const out = await dispatchRun(
      admin,
      {
        spec: CHARGEBACKS_FROM_POWER_APPS.file,
        operation: "change" as const,
        intent: CHARGEBACKS_FROM_POWER_APPS.intents.change,
        evidenceKey: "chargebacks",
        evidenceIds: listExport(repoRoot, "chargebacks"),
      },
      deps({ devin: devin.client }),
    );
    expect(out.dispatch.outcome.status).toBe("applied");
    const req = devin.created[0];
    expect(req.prompt).toContain("Operation: change.");
    expect(req.prompt).toContain("Spec: docs/CHARGEBACKS_FROM_POWER_APPS.md");
    expect(req.prompt).not.toContain("The attachment is the whole brief");
  });

  it("names the repository and base branch in the prompt when it is known", async () => {
    stopAll();
    const devin = fakeDevin({});
    await dispatchRun(manager, request, deps({ devin: devin.client, repository: "acme/ops-console" }));
    expect(devin.created[0].prompt).toMatch(
      /Repository: https:\/\/github\.com\/acme\/ops-console\. Branch from devin\/test at [0-9a-f]{7} and open the pull request against devin\/test\./,
    );
  });

  it("returns the prompt it sent, and records it for the run view", async () => {
    stopAll();
    const devin = fakeDevin({});
    const d = deps({ devin: devin.client, repository: "acme/ops-console" });
    const out = await dispatchRun(manager, request, d);
    expect(out.prompt).toBe(devin.created[0].prompt);
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    expect(runPrompt(run, d)).toBe(out.prompt);
  });

  it("records no prompt for a run whose session was never created", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({}));
    expect(out.prompt).not.toBeNull();
    expect(runPrompt({ id: out.runId }, { repoRoot })).toBeNull();
  });

  it("looks the playbook up when none is configured, and prefers a configured one", async () => {
    stopAll();
    const found = fakeDevin({});
    const lookups: string[] = [];
    const resolvePlaybookId = async () => {
      lookups.push("lookup");
      return "playbook-found";
    };
    await dispatchRun(manager, request, deps({ devin: found.client, resolvePlaybookId }));
    expect(found.created[0].playbookId).toBe("playbook-found");

    stopAll();
    const configured = fakeDevin({});
    await dispatchRun(
      manager,
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
      manager,
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
    const out = await dispatchRun(manager, request, deps({ devin: devin.client }));
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
    const out = await dispatchRun(analyst, request, deps({ devin: devin.client }));
    expect(out.dispatch.outcome.status).toBe("error");
    expect(out.session).toBeNull();
    expect(devin.calls).toEqual([]);
    expect(existsSync(join(repoRoot, "runs", out.runId))).toBe(false);
    expect(getRun(out.runId)).toBeNull();
  });

  it("stores the session URL the Devin API returned and hands it to the run view", async () => {
    stopAll();
    const url = "https://app.devin.ai/sessions/0f1e2d3c";
    const devin = fakeDevin({ create: async () => ({ sessionId: "devin-0f1e2d3c", url }) });
    const d = { ...deps({ devin: devin.client }), replaysDir: mkdtempSync(join(tmpdir(), "bridge-replays-")) };
    const out = await dispatchRun(manager, request, d);
    expect(getRun(out.runId)?.sessionUrl).toBe(url);

    vi.stubEnv("DEVIN_API_KEY", "test-key");
    try {
      const body = (await handleGet(out.runId, manager, d)).body as RunViewPayload;
      expect(body.mode).toBe("live");
      expect(body.sessionUrl).toBe(url);
      expect(body.run.sessionUrl).toBe(url);
    } finally {
      vi.unstubAllEnvs();
    }
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

  it("records a frame only when the snapshot changes", async () => {
    const run = await running();
    const d = deps({
      devin: fakeDevin({
        snapshot: { status: "working", statusDetail: null, structuredOutput: output() },
      }).client,
    });
    await pollRun(run, d);
    await pollRun(run, d);
    await pollRun(run, d);
    expect(readReplay(repoRoot, run.id)).toHaveLength(1);

    const changed = deps({
      devin: fakeDevin({
        snapshot: {
          status: "working",
          statusDetail: null,
          structuredOutput: output({ phase: "verify" }),
        },
      }).client,
    });
    await pollRun(run, changed);
    expect(readReplay(repoRoot, run.id)).toHaveLength(2);
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
    const out = await observeRun(manager, run, deps({ devin: devin.client }));
    expect(out.poll.kind).toBe("output");
    expect(out.record).toBeNull();
    expect(getRun(run.id)?.version).toBe(run.version);
  });

  it("lets a manager record a pull request on a run for a known application", async () => {
    const run = await running();
    const out = await observeRun(manager, run, deps({ devin: reportingPr().client }));
    expect(out.record?.outcome.status).toBe("applied");
    expect(getRun(run.id)?.prUrl).toBe(PR);
    expect(getRun(run.id)?.version).toBe(run.version + 1);
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
    const out = await approveRun(manager, run, undefined, deps({ github: github.client, devin: reportingPr().client }));
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

  it("re-posts the review on a retried approval when GitHub refused the first one", async () => {
    const run = await runningWithPr();
    const state = { green: true, contextSha: run.contextSha256, reviewFails: true };
    const github = fakeGitHub(state);
    const devin = reportingPr();
    const d = deps({ github: github.client, devin: devin.client });

    const first = await approveRun(engineer, run, undefined, d);
    expect(first.approve.outcome.status).toBe("applied");
    expect(first.reviewError).toContain("403");
    expect(getRun(run.id)?.status).toBe("approved");
    expect(devin.calls).toEqual(["get"]);

    state.reviewFails = false;
    const approved = getRun(run.id);
    if (!approved) throw new Error("no run");
    const second = await approveRun(engineer, approved, undefined, d);
    expect(second.approve.replayed).toBe(true);
    expect(second.reviewError).toBeNull();
    expect(github.calls.slice(-5)).toEqual(["pull", "checks", "file", "reviews", "approve"]);
    expect(devin.calls).toEqual(["get", `message:Run ${run.id} is approved. Merge ${PR} now.`]);
    expect(auditTrailFor("devin_run", run.id).filter((row) => row.action === "approve_pr")).toHaveLength(1);
  });

  it("a retried approval whose review already exists posts nothing", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256 });
    const d = deps({ github: github.client, devin: reportingPr().client });
    await approveRun(engineer, run, undefined, d);

    const approved = getRun(run.id);
    if (!approved) throw new Error("no run");
    const second = await approveRun(engineer, approved, undefined, d);
    expect(second.approve.replayed).toBe(true);
    expect(second.reviewError).toBeNull();
    expect(github.calls).toContain("reviews");
    expect(github.calls.filter((c) => c === "approve")).toHaveLength(1);
  });

  it("sends the merge message on retry when the review posted but the message failed", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256 });
    const script = {
      snapshot: {
        status: "working",
        statusDetail: null,
        structuredOutput: output({ phase: "pull_request", pr_url: PR }),
      },
      messageFails: true,
    };
    const devin = fakeDevin(script);
    const d = deps({ github: github.client, devin: devin.client });

    const first = await approveRun(engineer, run, undefined, d);
    expect(first.approve.outcome.status).toBe("applied");
    expect(first.reviewError).toContain("503");

    script.messageFails = false;
    const approved = getRun(run.id);
    if (!approved) throw new Error("no run");
    const second = await approveRun(engineer, approved, undefined, d);
    expect(second.approve.replayed).toBe(true);
    expect(second.reviewError).toBeNull();
    expect(github.calls.filter((c) => c === "approve")).toHaveLength(1);
    expect(devin.calls).toEqual([
      "get",
      `message:Run ${run.id} is approved. Merge ${PR} now.`,
      `message:Run ${run.id} is approved. Merge ${PR} now.`,
    ]);
  });
});

describe("observeGitHubApproval", () => {
  const MERGE_MESSAGE = (run: { id: string }) => `message:Run ${run.id} is approved. Merge ${PR} now.`;
  const byEngineer: ApprovingReview = { login: "rmtandon1", submittedAt: "2026-01-02T00:00:00Z", body: "LGTM" };

  async function runningWithPr() {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    return run;
  }

  it("treats the mapped engineer's GitHub approval as approve_pr and tells Devin to merge, without another review", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256, reviews: [byEngineer] });
    const devin = reportingPr();
    const d = deps({ github: github.client, devin: devin.client });

    const out = await observeGitHubApproval(run, d);
    expect(out.kind).toBe("approved");
    if (out.kind !== "approved") throw new Error(out.kind);
    expect(out.login).toBe("rmtandon1");
    expect(out.actor.id).toBe(engineer.id);
    expect(out.approve.outcome.status).toBe("applied");
    expect(out.messageError).toBeNull();
    expect(describeGitHubApproval(out)).toBeNull();
    expect(github.calls).toEqual(["pull", "list-reviews", "checks", "file"]);
    expect(devin.calls).toEqual(["get", MERGE_MESSAGE(run)]);

    const after = getRun(run.id);
    expect(after?.status).toBe("approved");
    expect(after?.prUrl).toBe(PR);
    expect(after?.approvedBy).toBe(engineer.id);
    expect(after?.lastNote).toBe("Approved on GitHub by @rmtandon1");
    const approvals = auditTrailFor("devin_run", run.id).filter((row) => row.action === "approve_pr");
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.actorId).toBe(engineer.id);
  });

  it("a second poll neither re-approves nor re-messages", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256, reviews: [byEngineer] });
    const devin = reportingPr();
    const d = deps({ github: github.client, devin: devin.client });

    await observeGitHubApproval(run, d);
    const approved = getRun(run.id);
    if (!approved) throw new Error("no run");
    const again = await observeGitHubApproval(approved, d);
    expect(again.kind).toBe("skipped");
    expect(devin.calls.filter((c) => c.startsWith("message:"))).toEqual([MERGE_MESSAGE(run)]);
    expect(auditTrailFor("devin_run", run.id).filter((row) => row.action === "approve_pr")).toHaveLength(1);
    expect(github.calls.filter((c) => c === "list-reviews")).toHaveLength(1);
  });

  it("denies the requester's own GitHub approval by the same rule as the button", async () => {
    stopAll();
    const id = ulid();
    db.insert(devinRuns)
      .values({
        id,
        operation: "change",
        spec: COMPANIES_HOUSE_CHECK.file,
        tool: "kyc",
        intent: "engineer-requested run",
        contextSha256: "e".repeat(64),
        sessionId: "devin-self",
        sessionUrl: null,
        status: "running",
        prUrl: PR,
        mergeCommit: null,
        reverses: null,
        requestedBy: engineer.id,
        requestedByRole: engineer.role,
        approvedBy: null,
        lastNote: null,
        requestedAt: 1,
        updatedAt: 1,
        version: 1,
      })
      .run();
    const run = getRun(id);
    if (!run) throw new Error("no run");
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256, reviews: [byEngineer] });
    const devin = reportingPr();

    const out = await observeGitHubApproval(run, deps({ github: github.client, devin: devin.client }));
    expect(out.kind).toBe("denied");
    if (out.kind !== "denied") throw new Error(out.kind);
    expect(out.reason).toBe("The person who asked for the run cannot approve its PR");
    expect(describeGitHubApproval(out)).toBe(
      "Approved on GitHub by @rmtandon1, but the console did not record it: The person who asked for the run cannot approve its PR",
    );
    expect(getRun(id)?.status).toBe("running");
    expect(devin.calls).toEqual([]);
    expect(auditTrailFor("devin_run", id)).toHaveLength(0);
  });

  it("surfaces an approval by a login no console engineer claims and records nothing", async () => {
    const run = await runningWithPr();
    const stranger: ApprovingReview = { login: "someone-else", submittedAt: "2026-01-02T00:00:00Z", body: "ship it" };
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256, reviews: [stranger] });
    const devin = reportingPr();

    const out = await observeGitHubApproval(run, deps({ github: github.client, devin: devin.client }));
    expect(out).toEqual({ kind: "unmatched", login: "someone-else" });
    expect(describeGitHubApproval(out)).toBe("Approved on GitHub by @someone-else (not a console engineer)");
    expect(github.calls).toEqual(["pull", "list-reviews"]);
    expect(devin.calls).toEqual(["get"]);
    expect(getRun(run.id)?.status).toBe("running");
    expect(auditTrailFor("devin_run", run.id).some((row) => row.action === "approve_pr")).toBe(false);
  });

  it("ignores the console's own review, even though it carries the engineer's login", async () => {
    const run = await runningWithPr();
    const github = fakeGitHub({ green: true, contextSha: run.contextSha256, approved: true });
    const devin = reportingPr();

    const out = await observeGitHubApproval(run, deps({ github: github.client, devin: devin.client }));
    expect(out).toEqual({ kind: "none" });
    expect(describeGitHubApproval(out)).toBeNull();
    expect(github.calls).toEqual(["pull", "list-reviews"]);
    expect(devin.calls).toEqual(["get"]);
    expect(getRun(run.id)?.status).toBe("running");
  });

  it("reports a denial while checks are red without spending the approval's idempotency key", async () => {
    const run = await runningWithPr();
    const state = { green: false, contextSha: run.contextSha256, reviews: [byEngineer] };
    const github = fakeGitHub(state);
    const devin = reportingPr();
    const d = deps({ github: github.client, devin: devin.client });

    const red = await observeGitHubApproval(run, d);
    expect(red.kind).toBe("denied");
    if (red.kind !== "denied") throw new Error(red.kind);
    expect(red.reason).toBe("The PR's checks are not green");
    expect(red.checks).toBe("failed: verify");
    expect(getRun(run.id)?.status).toBe("running");
    expect(auditTrailFor("devin_run", run.id).some((row) => row.action === "approve_pr")).toBe(false);

    state.green = true;
    const green = await observeGitHubApproval(run, d);
    expect(green.kind).toBe("approved");
    expect(getRun(run.id)?.status).toBe("approved");
    expect(devin.calls.filter((c) => c.startsWith("message:"))).toEqual([MERGE_MESSAGE(run)]);
  });

  it("does nothing for a run that is not waiting on approval, or that has no PR or GitHub", async () => {
    const run = await runningWithPr();
    const silent = fakeDevin({ snapshot: { status: "working", statusDetail: null, structuredOutput: output() } });
    expect(await observeGitHubApproval(run, deps({ github: fakeGitHub({}).client, devin: silent.client }))).toEqual({
      kind: "skipped",
    });
    expect(await observeGitHubApproval(run, deps({ devin: reportingPr().client }))).toEqual({
      kind: "unavailable",
      reason: "GitHub API is not configured",
    });
    const stopped = await stopRun(admin, run, "done", deps({ devin: fakeDevin({}).client }));
    expect(stopped.stop.outcome.status).toBe("applied");
    const after = getRun(run.id);
    if (!after) throw new Error("no run");
    expect(await observeGitHubApproval(after, deps({ github: fakeGitHub({}).client }))).toEqual({ kind: "skipped" });
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

  it("records a merge GitHub reports on a running run, naming the missing approval", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    expect(run.prUrl).toBeNull();

    // No recorded PR yet: the URL comes from the session's latest output.
    const open = await observeMerge(engineer, run, deps({ github: fakeGitHub({ merged: false }).client, devin: reportingPr().client }));
    expect(open).toEqual({ kind: "open", prUrl: PR });

    const merged = await observeMerge(engineer, run, deps({ github: fakeGitHub({ merged: true }).client, devin: reportingPr().client }));
    expect(merged.kind).toBe("merged");
    if (merged.kind !== "merged") throw new Error(merged.kind);
    expect(merged.record.outcome.status).toBe("applied");
    const after = getRun(run.id);
    expect(after?.status).toBe("merged");
    expect(after?.mergeCommit).toBe(MERGE);
    expect(after?.prUrl).toBe(PR);
    expect(after?.approvedBy).toBeNull();
    expect(after?.lastNote).toBe("Merged on GitHub without a recorded approval");
    expect(auditTrailFor("devin_run", run.id).map((row) => row.action)).toEqual([
      "record_merge",
      "record_session",
      "dispatch",
    ]);
  });

  it("counts a merge by the mapped engineer as their approval before recording the merge", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    const devin = reportingPr();
    const github = fakeGitHub({ merged: true, mergedBy: "rmtandon1", green: true, contextSha: run.contextSha256 });

    const merged = await observeMerge(engineer, run, deps({ github: github.client, devin: devin.client }));
    expect(merged.kind).toBe("merged");
    if (merged.kind !== "merged") throw new Error(merged.kind);
    expect(merged.record.outcome.status).toBe("applied");
    const after = getRun(run.id);
    expect(after?.status).toBe("merged");
    expect(after?.mergeCommit).toBe(MERGE);
    expect(after?.approvedBy).toBe(engineer.id);
    expect(after?.lastNote).toBe("Approved on GitHub by @rmtandon1, who merged without a review");
    expect(JSON.stringify(merged.record.outcome)).toContain("merge_follows_approval");
    const trail = auditTrailFor("devin_run", run.id);
    expect(trail.map((row) => row.action)).toEqual(["record_merge", "approve_pr", "record_session", "dispatch"]);
    expect(trail.find((row) => row.action === "approve_pr")?.actorId).toBe(engineer.id);
    // A merger needs no "merge now" message; the merge already happened.
    expect(devin.calls.filter((c) => c.startsWith("message:"))).toEqual([]);
  });

  it("records a merge by a login no engineer claims, naming the merger in the gap note", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    const github = fakeGitHub({ merged: true, mergedBy: "octo-eng" });

    const merged = await observeMerge(engineer, run, deps({ github: github.client, devin: reportingPr().client }));
    expect(merged.kind).toBe("merged");
    const after = getRun(run.id);
    expect(after?.status).toBe("merged");
    expect(after?.approvedBy).toBeNull();
    expect(after?.lastNote).toBe("Merged on GitHub by @octo-eng without a recorded approval");
    expect(auditTrailFor("devin_run", run.id).some((row) => row.action === "approve_pr")).toBe(false);
  });

  it("merges with the named-gap note when the merger's approval is denied by red checks", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    const github = fakeGitHub({
      merged: true,
      mergedBy: "rmtandon1",
      green: false,
      contextSha: run.contextSha256,
    });

    const merged = await observeMerge(engineer, run, deps({ github: github.client, devin: reportingPr().client }));
    expect(merged.kind).toBe("merged");
    const after = getRun(run.id);
    expect(after?.status).toBe("merged");
    expect(after?.approvedBy).toBeNull();
    expect(after?.lastNote).toBe("Merged on GitHub by @rmtandon1 without a recorded approval");
    expect(auditTrailFor("devin_run", run.id).some((row) => row.action === "approve_pr")).toBe(false);
  });

  it("stops a run whose PR GitHub reports closed without a merge, once", async () => {
    const run = await approved();
    const closed = await observeMerge(admin, run, deps({ github: fakeGitHub({ closed: true }).client }));
    expect(closed.kind).toBe("closed");
    if (closed.kind !== "closed") throw new Error(closed.kind);
    expect(closed).toMatchObject({ prUrl: PR, number: 99 });
    expect(closed.stop.outcome.status).toBe("applied");
    const after = getRun(run.id);
    expect(after?.status).toBe("stopped");
    expect(after?.mergeCommit).toBeNull();
    expect(after?.lastNote).toBe(prClosedReason(closed.number));
    const stops = auditTrailFor("devin_run", run.id).filter((row) => row.action === "stop");
    expect(stops).toHaveLength(1);

    const again = await observeMerge(admin, run, deps({ github: fakeGitHub({ closed: true }).client }));
    expect(again.kind).toBe("closed");
    if (again.kind === "closed") expect(again.stop.replayed).toBe(true);
    expect(auditTrailFor("devin_run", run.id).filter((row) => row.action === "stop")).toHaveLength(1);
  });

  it("stops a running run whose PR was closed before any approval", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    const closed = await observeMerge(engineer, run, deps({ github: fakeGitHub({ closed: true }).client, devin: reportingPr().client }));
    expect(closed.kind).toBe("closed");
    const after = getRun(run.id);
    expect(after?.status).toBe("stopped");
    expect(after?.approvedBy).toBeNull();
    expect(auditTrailFor("devin_run", run.id).map((row) => row.action)).toEqual([
      "stop",
      "record_session",
      "dispatch",
    ]);
  });

  it("stays unavailable without a PR from either the run or its session", async () => {
    stopAll();
    const out = await dispatchRun(admin, request, deps({ devin: fakeDevin({}).client }));
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    const silent = fakeDevin({ snapshot: { status: "working", statusDetail: null, structuredOutput: output() } });
    const outcome = await observeMerge(engineer, run, deps({ github: fakeGitHub({ merged: true }).client, devin: silent.client }));
    expect(outcome).toEqual({ kind: "unavailable", reason: "The run has no pull request yet" });
    expect(getRun(run.id)?.status).toBe("running");
  });

  it("builds an undo's context from the merged run's evidence, not the caller's", async () => {
    const run = await approved();
    await observeMerge(admin, run, deps({ github: fakeGitHub({ merged: true }).client }));
    const devin = fakeDevin({});
    const out = await dispatchRun(
      admin,
      {
        ...request,
        operation: "undo",
        intent: COMPANIES_HOUSE_CHECK.intents.undo,
        evidenceKey: "kyc_0001",
        evidenceIds: [],
        reverses: run.id,
      },
      deps({ devin: devin.client }),
    );
    expect(out.dispatch.outcome.status).toBe("applied");
    const context = JSON.parse(readFileSync(join(repoRoot, "runs", out.runId, "context.json"), "utf8"));
    expect(context.evidence.source).toBe("kyc:kyc_0003");
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
    const out = await stopRun(analyst, run, "nope", deps({ devin: devin.client }));
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
    expect(sync).toEqual({ kind: "synced", before: BEFORE, after: AFTER, installed: false, migrated: false, seeded: [] });
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
    expect(sync).toEqual({ kind: "synced", before: BEFORE, after: AFTER, installed: false, migrated: true, seeded: [] });
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
    expect(again).toEqual({ kind: "synced", before: BEFORE, after: AFTER, installed: false, migrated: false, seeded: [] });
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
    expect(second).toEqual({ kind: "synced", before: AFTER, after: AFTER, installed: false, migrated: true, seeded: [] });
    expect(migrated).toEqual([repoRoot]);
  });

  it("seeds newly merged tools after migrating and reports them", async () => {
    const run = await merged();
    const order: string[] = [];
    const seedCwd: string[] = [];
    const sync = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE] }).git,
        migrate: async () => void order.push("migrate"),
        migrationsPending: async () => true,
        seedNew: async (cwd) => {
          order.push("seed");
          seedCwd.push(cwd);
          return ["chargebacks"];
        },
      }),
    );
    expect(sync).toEqual({
      kind: "synced",
      before: BEFORE,
      after: AFTER,
      installed: false,
      migrated: true,
      seeded: ["chargebacks"],
    });
    expect(order).toEqual(["migrate", "seed"]);
    expect(seedCwd).toEqual([repoRoot]);
    expect(describeSync(sync)).toContain("seeded chargebacks");
  });

  it("retries a failed seed on the next call even when nothing moved", async () => {
    const run = await merged();
    const first = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE] }).git,
        migrationsPending: async () => false,
        seedNew: async () => {
          throw new Error("no such table");
        },
      }),
    );
    expect(first.kind).toBe("failed");
    if (first.kind === "failed") {
      expect(first.reason).toContain("db:seed:new failed");
      expect(first.reason).toContain("no such table");
    }

    const second = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: AFTER, ancestors: [MERGE] }).git,
        migrationsPending: async () => false,
        seedNew: async () => ["chargebacks"],
      }),
    );
    expect(second).toEqual({
      kind: "synced",
      before: AFTER,
      after: AFTER,
      installed: false,
      migrated: false,
      seeded: ["chargebacks"],
    });
  });

  it("reports unchanged only when neither HEAD nor migrations moved", async () => {
    const run = await merged();
    const fake = fakeGit({ before: BEFORE, ancestors: [MERGE] });
    const sync = await syncMergedRun(run, deps({ git: fake.git, migrationsPending: async () => false }));
    expect(sync).toEqual({ kind: "unchanged", head: BEFORE });

    const seeded = await syncMergedRun(
      run,
      deps({ git: fake.git, migrationsPending: async () => false, seedNew: async () => [] }),
    );
    expect(seeded).toEqual({ kind: "unchanged", head: BEFORE });
  });

  it("runs pnpm install before db:migrate when the pull changes a dependency manifest", async () => {
    const run = await merged();
    const steps: string[] = [];
    const sync = await syncMergedRun(
      run,
      deps({
        git: fakeGit({
          before: BEFORE,
          after: AFTER,
          ancestors: [MERGE],
          changed: ["tools/chargebacks/package.json", "tools/chargebacks/src/index.ts"],
        }).git,
        install: async (cwd) => void steps.push(`install:${cwd}`),
        migrate: async (cwd) => void steps.push(`migrate:${cwd}`),
        migrationsPending: async () => true,
      }),
    );
    expect(sync).toEqual({ kind: "synced", before: BEFORE, after: AFTER, installed: true, migrated: true, seeded: [] });
    expect(steps).toEqual([`install:${repoRoot}`, `migrate:${repoRoot}`]);
    expect(describeSync(sync)).toContain("dependencies installed");
  });

  it.each(["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "apps/console/package.json"])(
    "installs when %s changed",
    async (path) => {
      const run = await merged();
      let installs = 0;
      const sync = await syncMergedRun(
        run,
        deps({
          git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE], changed: [path] }).git,
          install: async () => void (installs += 1),
          migrationsPending: async () => false,
        }),
      );
      expect(sync.kind === "synced" && sync.installed).toBe(true);
      expect(installs).toBe(1);
    },
  );

  it("does not install when the pull changes no dependency manifest", async () => {
    const run = await merged();
    let installs = 0;
    const sync = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE], changed: ["tools/refunds/src/index.ts"] }).git,
        install: async () => void (installs += 1),
        installPending: async () => false,
        migrationsPending: async () => false,
      }),
    );
    expect(sync).toEqual({ kind: "synced", before: BEFORE, after: AFTER, installed: false, migrated: false, seeded: [] });
    expect(installs).toBe(0);
  });

  it("fails without migrating when pnpm install fails, and retries it on the next call", async () => {
    const run = await merged();
    const migrated: string[] = [];
    const first = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: BEFORE, after: AFTER, ancestors: [MERGE], changed: ["pnpm-lock.yaml"] }).git,
        install: async () => {
          throw new Error("ERR_PNPM_OUTDATED_LOCKFILE");
        },
        migrate: async (cwd) => void migrated.push(cwd),
        migrationsPending: async () => true,
      }),
    );
    expect(first.kind).toBe("failed");
    if (first.kind === "failed") expect(first.reason).toContain("pnpm install failed");
    expect(migrated).toEqual([]);

    let installs = 0;
    const second = await syncMergedRun(
      run,
      deps({
        git: fakeGit({ before: AFTER, ancestors: [MERGE] }).git,
        install: async () => void (installs += 1),
        installPending: async () => true,
        migrationsPending: async () => false,
      }),
    );
    expect(second).toEqual({ kind: "synced", before: AFTER, after: AFTER, installed: true, migrated: false, seeded: [] });
    expect(installs).toBe(1);
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

  it("isSynced stays false while a seed is pending", async () => {
    const run = await merged();
    let pending = true;
    const d = deps({
      git: fakeGit({ ancestors: [MERGE] }).git,
      migrationsPending: async () => false,
      seedPending: async () => pending,
    });
    expect(await isSynced(run, d)).toBe(false);
    pending = false;
    expect(await isSynced(run, d)).toBe(true);
  });

  it("isSynced stays false while dependencies lag the lockfile", async () => {
    const run = await merged();
    let pending = true;
    const d = deps({
      git: fakeGit({ ancestors: [MERGE] }).git,
      installPending: async () => pending,
      migrationsPending: async () => false,
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
          operation: "change",
          spec: COMPANIES_HOUSE_CHECK.file,
          tool: "kyc",
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
    expect(sessionBody).not.toHaveProperty("create_as_user_id");

    const snap = await client.getSession("devin-1");
    expect(snap).toEqual({ status: "blocked", statusDetail: "waiting", structuredOutput: { phase: "plan" } });
    await client.terminateSession("devin-1");
    expect(http.seen.at(-1)?.method).toBe("DELETE");
  });

  it("Devin client creates the session on behalf of the configured user", async () => {
    const http = recorder({
      "POST https://api.devin.ai/v3/organizations/org_1/attachments": () => ({ url: "https://files/ctx" }),
      "POST https://api.devin.ai/v3/organizations/org_1/sessions": () => ({
        session_id: "devin-1",
        url: "https://app.devin.ai/sessions/1",
      }),
    });
    const client = httpDevinClient({ apiKey: "k", orgId: "org_1", createAsUserId: "user-abc" }, http.fetchImpl);
    await client.createSession({
      prompt: "p",
      title: "t",
      tags: [],
      attachment: { name: "context.json", body: "{}" },
      structuredOutputSchema: { type: "object" },
    });
    expect(JSON.parse(http.seen[1].body ?? "{}").create_as_user_id).toBe("user-abc");
  });

  it("Devin client reads Devin's latest message across pages", async () => {
    const http = recorder({
      "GET https://api.devin.ai/v3/organizations/org_1/sessions/devin-1/messages?first=100&after=c1": () => ({
        items: [
          { source: "devin", message: "Running the baseline tests" },
          { source: "user", message: "Any update?" },
        ],
        end_cursor: null,
        has_next_page: false,
      }),
      "GET https://api.devin.ai/v3/organizations/org_1/sessions/devin-1/messages?first=100": () => ({
        items: [{ source: "devin", message: "Starting run" }],
        end_cursor: "c1",
        has_next_page: true,
      }),
    });
    const client = httpDevinClient({ apiKey: "k", orgId: "org_1" }, http.fetchImpl);
    expect(await client.latestMessage?.("devin-1")).toBe("Running the baseline tests");
    expect(http.seen).toHaveLength(2);
  });

  it("Devin client resumes message paging from the last full page it read", async () => {
    let polls = 0;
    const http = recorder({
      "GET https://api.devin.ai/v3/organizations/org_1/sessions/devin-2/messages?first=100&after=c1": () => ({
        items: [
          { source: "devin", message: "Running the baseline tests" },
          ...(++polls > 1 ? [{ source: "devin", message: "Editing the rule" }] : []),
        ],
        end_cursor: null,
        has_next_page: false,
      }),
      "GET https://api.devin.ai/v3/organizations/org_1/sessions/devin-2/messages?first=100": () => ({
        items: [{ source: "devin", message: "Starting run" }],
        end_cursor: "c1",
        has_next_page: true,
      }),
    });
    const client = httpDevinClient({ apiKey: "k", orgId: "org_1" }, http.fetchImpl);
    expect(await client.latestMessage?.("devin-2")).toBe("Running the baseline tests");
    const again = httpDevinClient({ apiKey: "k", orgId: "org_1" }, http.fetchImpl);
    expect(await again.latestMessage?.("devin-2")).toBe("Editing the rule");
    expect(http.seen.map((r) => r.url.split("?")[1])).toEqual(["first=100", "first=100&after=c1", "first=100&after=c1"]);
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
        state: "closed",
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
    expect(pull).toEqual({ headSha: HEAD, headRef: "devin/run", state: "closed", merged: true, mergeCommit: MERGE, mergedBy: null });
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

  it("GitHub client reports an approving review only when one exists at the head sha", async () => {
    let reviews: unknown = [
      { state: "APPROVED", commit_id: HEAD },
      { state: "COMMENTED", commit_id: HEAD },
    ];
    const http = recorder({
      "GET https://api.github.com/repos/o/r/pulls/7/reviews": () => reviews,
    });
    const client = httpGitHubClient("tok", http.fetchImpl);
    const ref = parsePullUrl("https://github.com/o/r/pull/7");
    if (!ref) throw new Error("parse failed");
    expect(await client.hasApprovingReview(ref, HEAD)).toBe(true);
    reviews = [];
    expect(await client.hasApprovingReview(ref, HEAD)).toBe(false);
  });

  it("GitHub client lists who approved at the head sha, with when and what they wrote", async () => {
    const http = recorder({
      "GET https://api.github.com/repos/o/r/pulls/7/reviews": () => [
        { state: "APPROVED", commit_id: HEAD, user: { login: "rmtandon1" }, submitted_at: "2026-01-02T03:04:05Z", body: "LGTM" },
        { state: "APPROVED", commit_id: HEAD, user: { login: "bot" }, submitted_at: null, body: null },
        { state: "APPROVED", commit_id: "0".repeat(40), user: { login: "stale" }, submitted_at: "2026-01-01T00:00:00Z", body: "old head" },
        { state: "CHANGES_REQUESTED", commit_id: HEAD, user: { login: "critic" }, submitted_at: "2026-01-02T00:00:00Z", body: "no" },
        { state: "APPROVED", commit_id: HEAD, user: null, submitted_at: "2026-01-02T00:00:00Z", body: "ghost" },
      ],
    });
    const client = httpGitHubClient("tok", http.fetchImpl);
    const ref = parsePullUrl("https://github.com/o/r/pull/7");
    if (!ref) throw new Error("parse failed");
    expect(await client.listApprovingReviews(ref, HEAD)).toEqual([
      { login: "rmtandon1", submittedAt: "2026-01-02T03:04:05Z", body: "LGTM" },
      { login: "bot", submittedAt: "", body: "" },
    ]);
    expect(await client.hasApprovingReview(ref, HEAD)).toBe(true);
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
