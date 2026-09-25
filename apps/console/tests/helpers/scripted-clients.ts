import { createHash } from "node:crypto";
import type {
  CreatedSession,
  CreateSessionRequest,
  DevinClient,
  SessionSnapshot,
  GitHubClient,
  PullRef,
} from "@console/tool-automation";
import {
  automationTool,
  CI_CHECKS,
  type DevinRun,
  getRun,
  getRunByPrUrl,
  IN_FLIGHT_STATUSES,
  type ReplayFrame,
  type RunKind,
  type StructuredOutput,
} from "@console/tool-automation";

/**
 * Scripted stand-ins for the Devin and GitHub clients, used when the server
 * has no Devin key. A replay run moves through the same intents as a live
 * one; only the outside calls are played from a compressed script. The
 * frames are valid `StructuredOutput`, so the run view cannot tell replay
 * from a recording except by the "Replay" label the UI adds.
 */

const REPO_PR_BASE = "https://github.com/rmtandon1/buy-v-build-cog-demo/pull";

/** A deterministic fake 40-hex digest, so replay runs look like git objects. */
function fakeSha(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 40);
}

function out(over: Partial<StructuredOutput>): StructuredOutput {
  return {
    phase: "intake",
    phase_status: "running",
    phase_durations_s: {},
    base_commit: null,
    context_sha256: null,
    branch: null,
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

interface ScriptFile {
  path: string;
  op: "create" | "modify" | "delete";
  additions: number;
  deletions: number;
  reason: string;
}

/** The run's change set, taken from REFUND_CLUSTERING_HOLD.md's Scope list. */
function scriptFiles(kind: RunKind, runId: string): ScriptFile[] {
  if (kind === "REVERSAL") {
    return [
      {
        path: "tools/refunds/src/clustering-hold.ts",
        op: "delete",
        additions: 0,
        deletions: 84,
        reason: "remove the clustering_hold rule and the shared cluster query",
      },
      {
        path: "tools/refunds/src/index.ts",
        op: "modify",
        additions: 0,
        deletions: 6,
        reason: "unregister the rule and drop the window constant; keep partial_delivery",
      },
      {
        path: "tools/kyc/src/index.ts",
        op: "modify",
        additions: 1,
        deletions: 12,
        reason: "remove linked_refund_hold from approve",
      },
      {
        path: "apps/console/tests/tools/refunds-clustering-hold.test.ts",
        op: "delete",
        additions: 0,
        deletions: 71,
        reason: "tests that assert the rule being removed",
      },
      {
        path: "apps/console/tests/tools/kyc.test.ts",
        op: "modify",
        additions: 0,
        deletions: 8,
        reason: "remove the linked_refund_hold cases",
      },
      { path: `runs/${runId}/context.json`, op: "create", additions: 1, deletions: 0, reason: "run context, verbatim" },
    ];
  }
  return [
    {
      path: "tools/refunds/src/clustering-hold.ts",
      op: "create",
      additions: 84,
      deletions: 0,
      reason: "clustering_hold rule and the shared cluster query",
    },
    {
      path: "tools/refunds/src/index.ts",
      op: "modify",
      additions: 6,
      deletions: 0,
      reason: "register clustering_hold on execute and declare the window constant",
    },
    {
      path: "tools/kyc/src/index.ts",
      op: "modify",
      additions: 12,
      deletions: 1,
      reason: "linked_refund_hold on approve",
    },
    {
      path: "apps/console/tests/tools/refunds-clustering-hold.test.ts",
      op: "create",
      additions: 71,
      deletions: 0,
      reason: "the spec's refund acceptance tests",
    },
    {
      path: "apps/console/tests/tools/kyc.test.ts",
      op: "modify",
      additions: 8,
      deletions: 0,
      reason: "linked_refund_hold cases",
    },
    { path: `runs/${runId}/context.json`, op: "create", additions: 1, deletions: 0, reason: "run context, verbatim" },
  ];
}

const REUSES = [
  {
    module: "packages/engine/src/execute-intent.ts",
    reason: "the hold is registered as a policy rule, not a side path",
  },
  {
    module: "packages/engine/src/approvals.ts",
    reason: "held refunds go to the existing manager tier",
  },
  { module: "packages/engine/src/audit", reason: "every hold decision is an audit row" },
];

/**
 * A compressed timeline for `kind`, paced for camera: intake 0–2s, baseline
 * to 6s, plan lands at 12s, edits to 26s, the four CI checks flip one per
 * 4s inside verify — slow enough that a 2s UI poll sees each one — and the
 * PR is open by 44s.
 */
export function scriptedFrames(
  kind: RunKind,
  runId: string,
  contextSha: string,
  baseCommit: string,
): ReplayFrame[] {
  const branch = `devin/${kind === "REVERSAL" ? "reverse-hold" : "clustering-hold"}-${runId}`;
  const planCommit = fakeSha("plan", runId).slice(0, 40);
  const prUrl = `${REPO_PR_BASE}/${kind === "REVERSAL" ? 991 : 990}`;
  const files = scriptFiles(kind, runId);
  const verify = (upto: number): StructuredOutput["verify_steps"] =>
    CI_CHECKS.map((name, i) => ({
      name,
      pass: i < upto ? true : null,
      ...(name === "Test" ? { before: 68, after: i < upto ? 76 : null } : {}),
    }));

  const base = {
    base_commit: baseCommit,
    context_sha256: contextSha,
    branch,
  };
  const durations = {
    intake: 2,
    baseline: 4,
    plan: 6,
    edit: 14,
    verify: 10,
    pull_request: 4,
  };
  /** Durations for the phases done so far; a phase has no time until it ends. */
  const d = (through: keyof typeof durations): StructuredOutput["phase_durations_s"] =>
    Object.fromEntries(
      Object.entries(durations).slice(0, Object.keys(durations).indexOf(through) + 1),
    );

  const frame = (
    at_ms: number,
    status: string,
    statusDetail: string | null,
    output: StructuredOutput,
  ): ReplayFrame => ({ at_ms, status, status_detail: statusDetail, structured_output: output });

  return [
    frame(0, "running", "Reading spec and context", out({ ...base })),
    frame(
      2_000,
      "running",
      "Baseline verify at the base commit",
      out({ ...base, phase: "baseline", phase_durations_s: d("intake") }),
    ),
    frame(
      6_000,
      "running",
      "Writing the plan",
      out({
        ...base,
        phase: "plan",
        phase_durations_s: d("baseline"),
      }),
    ),
    frame(
      12_000,
      "running",
      `Editing ${files[0].path}`,
      out({
        ...base,
        phase: "edit",
        phase_durations_s: d("plan"),
        plan_commit: planCommit,
        reuses: kind === "REVERSAL" ? [] : REUSES,
        files: files.map((f) => ({ ...f, additions: 0, deletions: 0 })),
      }),
    ),
    frame(
      26_000,
      "running",
      "Running pnpm verify",
      out({
        ...base,
        phase: "verify",
        phase_durations_s: d("edit"),
        plan_commit: planCommit,
        reuses: kind === "REVERSAL" ? [] : REUSES,
        files,
        conflicts:
          kind === "REVERSAL"
            ? [
                {
                  file: "tools/refunds/src/index.ts",
                  kept: "partial_delivery reason code (PR #7)",
                  removed: "clustering_hold registration",
                },
              ]
            : [],
        verify_steps: verify(0),
      }),
    ),
    ...[0, 1, 2].map((i) =>
      frame(
        28_000 + i * 4_000,
        "running",
        `pnpm verify: ${CI_CHECKS[i]} green`,
        out({
          ...base,
          phase: "verify",
          phase_durations_s: d("edit"),
          plan_commit: planCommit,
          reuses: kind === "REVERSAL" ? [] : REUSES,
          files,
          verify_steps: verify(i + 1),
        }),
      ),
    ),
    frame(
      40_000,
      "running",
      "Opening the pull request",
      out({
        ...base,
        phase: "pull_request",
        phase_durations_s: d("verify"),
        plan_commit: planCommit,
        reuses: kind === "REVERSAL" ? [] : REUSES,
        files,
        conflicts:
          kind === "REVERSAL"
            ? [
                {
                  file: "tools/refunds/src/index.ts",
                  kept: "partial_delivery reason code (PR #7)",
                  removed: "clustering_hold registration",
                },
              ]
            : [],
        verify_steps: verify(CI_CHECKS.length),
      }),
    ),
    frame(
      44_000,
      "blocked",
      "blocked_on_approval",
      out({
        ...base,
        phase: "pull_request",
        phase_status: "done",
        phase_durations_s: d("pull_request"),
        plan_commit: planCommit,
        reuses: kind === "REVERSAL" ? [] : REUSES,
        files,
        verify_steps: verify(CI_CHECKS.length),
        pr_url: prUrl,
      }),
    ),
  ];
}

/** The frame the session reports once the run is approved: merged, phase done. */
export function mergedFrame(runId: string, kind: RunKind, contextSha: string): StructuredOutput {
  const frames = scriptedFrames(kind, runId, contextSha, fakeSha("base", runId));
  const last = frames[frames.length - 1].structured_output;
  return {
    ...last,
    phase: "merge",
    phase_status: "done",
    phase_durations_s: { ...last.phase_durations_s, merge: 2 },
    merge_commit: fakeSha("merge", runId),
  };
}

interface ReplaySession {
  runId: string;
  frames: ReplayFrame[];
  startMs: number;
}

/**
 * A `DevinClient` that plays `scriptedFrames` on a fake clock. The session id
 * embeds the run id so polls for a restarted process still line up; dispatch
 * records it through `record_session` exactly as a live id would be.
 */
export function replayDevinClient(now: () => number = Date.now): DevinClient {
  const sessions = new Map<string, ReplaySession>();

  function snapshotFor(session: ReplaySession): SessionSnapshot {
    const run = getRun(session.runId);
    if (run && (run.status === "approved" || run.status === "merged")) {
      return {
        status: "finished",
        statusDetail: "merged",
        structuredOutput: mergedFrame(session.runId, run.kind as RunKind, run.contextSha256),
      };
    }
    const elapsed = now() - session.startMs;
    let frame = session.frames[0];
    for (const candidate of session.frames) {
      if (candidate.at_ms <= elapsed) frame = candidate;
    }
    return {
      status: frame.status,
      statusDetail: frame.status_detail,
      structuredOutput: frame.structured_output,
    };
  }

  return {
    async createSession(req: CreateSessionRequest): Promise<CreatedSession> {
      const tag = req.tags.find((t) => t.startsWith("run:"));
      const runId = req.runId ?? tag?.slice(4) ?? "unknown";
      const run = getRun(runId);
      const startMs = now();
      const session: ReplaySession = {
        runId,
        frames: scriptedFrames(
          (run?.kind as RunKind) ?? "IMPLEMENTATION/ADDITION",
          runId,
          run?.contextSha256 ?? "0".repeat(64),
          fakeSha("base", runId),
        ),
        startMs,
      };
      const sessionId = `replay-${startMs}-${runId}`;
      sessions.set(sessionId, session);
      return { sessionId, url: null };
    },
    async getSession(sessionId: string): Promise<SessionSnapshot> {
      const session = sessions.get(sessionId);
      if (!session) {
        // A restarted process lost the in-memory session; rebuild it from the
        // run id embedded in the id so polling still replays the script.
        const runId = sessionId.split("-").pop() ?? sessionId;
        const run = getRun(runId);
        if (!run) throw new Error(`replay: no session ${sessionId}`);
        const rebuilt: ReplaySession = {
          runId,
          frames: scriptedFrames(run.kind as RunKind, runId, run.contextSha256, fakeSha("base", runId)),
          startMs: Number(sessionId.split("-")[1]) || now(),
        };
        sessions.set(sessionId, rebuilt);
        return snapshotFor(rebuilt);
      }
      return snapshotFor(session);
    },
    async sendMessage() {
      // Replays take no input; the reply is still audited on the run.
    },
    async terminateSession() {
      // Nothing to end; `stop` is recorded by executeIntent regardless.
    },
  };
}

/** Devin "merges" four seconds after the approval lands. */
const MERGE_DELAY_MS = 4_000;

/**
 * A `GitHubClient` whose answers come from `devin_runs`: a PR is merged once
 * its run has been approved for `MERGE_DELAY_MS`, and the branch's
 * `context.json` always hashes to the dispatched digest.
 */
export function replayGitHubClient(now: () => number = Date.now): GitHubClient {
  function runFor(pr: PullRef) {
    // An in-flight replay run wins over a URL match: a merged run keeps its
    // pr_url forever, but it is no longer the PR this getPull is about.
    const { rows } = automationTool.list({ filters: {}, limit: 200, offset: 0 });
    const inFlight = (rows as DevinRun[])
      .filter(
        (r) =>
          r.sessionId?.startsWith("replay-") &&
          IN_FLIGHT_STATUSES.includes(r.status as (typeof IN_FLIGHT_STATUSES)[number]) &&
          (pr.number === 991 ? r.kind === "REVERSAL" : r.kind !== "REVERSAL"),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return inFlight ?? getRunByPrUrl(`${REPO_PR_BASE}/${pr.number}`);
  }
  return {
    async getPull(pr) {
      const run = runFor(pr);
      const headSha = fakeSha("head", `${pr.owner}/${pr.repo}#${pr.number}`);
      if (!run) return { headSha, headRef: `devin/replay`, merged: false, mergeCommit: null };
      const merged =
        run.status === "merged" ||
        (run.status === "approved" && now() - run.updatedAt >= MERGE_DELAY_MS);
      return {
        headSha,
        headRef: `devin/replay-${run.id}`,
        merged,
        mergeCommit: merged ? (run.mergeCommit ?? fakeSha("merge", run.id)) : null,
      };
    },
    async getChecks() {
      return { green: true, summary: CI_CHECKS.join(", ") };
    },
    async fileSha256(pr) {
      return runFor(pr)?.contextSha256 ?? null;
    },
    async approvePull() {
      // The approval is recorded by approve_pr; the review endpoint is a no-op.
    },
  };
}
