import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import type { Actor, IntentResult } from "@console/engine/types";
import { buildContext } from "./context";
import type { DevinClient } from "./devin-api";
import { SYNC_BRANCH, SYNC_REMOTE, type GitRunner } from "./git";
import { type GitHubClient, parsePullUrl } from "./github-api";
import { automationTool, getRun, type DevinRun } from "./index";
import { ReplayFile, type ReplayFrame, STRUCTURED_OUTPUT_JSON_SCHEMA, StructuredOutput } from "./run-files";
import { getSpec, type RunKind, type RunScope } from "./specs";

/**
 * The bridge between the governed `automation` actions and the outside world.
 * Every database change here is an `executeIntent` call; the Devin and GitHub
 * calls happen strictly after the intent they depend on has committed, or
 * strictly before the intent that records what they returned. Polled session
 * progress goes to `runs/<id>/replay.json`, never to `devin_runs`
 * (DEVIN_RUN_PROTOCOL.md § Progress).
 */

export interface BridgeDeps {
  /** Null when `DEVIN_API_KEY` / `DEVIN_ORG_ID` are not set on the server. */
  devin: DevinClient | null;
  /** Null when `GITHUB_TOKEN` is not set on the server. */
  github: GitHubClient | null;
  /** Repository root: `runs/<id>/` is written under it and git is read from it. */
  repoRoot: string;
  /** Checkout access for the merge sync; absent in tests that do not pull. */
  git?: GitRunner;
  /** Runs the console's own migration script; absent skips it like a missing drizzle diff. */
  migrate?: (cwd: string) => Promise<void>;
  /** Remote and branch the merge sync pulls; default to `SYNC_REMOTE` / `SYNC_BRANCH`. */
  syncRemote?: string;
  syncBranch?: string;
  playbookId?: string;
  maxAcuLimit?: number;
  now?: () => number;
}

export interface DispatchRequest {
  spec: string;
  kind: RunKind;
  scope: RunScope;
  intent: string;
  clusterKey: string;
  evidenceIds: readonly string[];
  reverses?: string | null;
}

export interface DispatchOutcome {
  runId: string;
  dispatch: IntentResult;
  /** The `record_session` result; null when `dispatch` itself did not apply. */
  session: IntentResult | null;
  sessionUrl: string | null;
}

export function runDir(repoRoot: string, runId: string): string {
  return join(repoRoot, "runs", runId);
}

export function readContextJson(repoRoot: string, runId: string): string | null {
  const path = join(runDir(repoRoot, runId), "context.json");
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function readReplay(repoRoot: string, runId: string): ReplayFrame[] {
  const path = join(runDir(repoRoot, runId), "replay.json");
  if (!existsSync(path)) return [];
  const parsed = ReplayFile.safeParse(JSON.parse(readFileSync(path, "utf8")));
  return parsed.success ? parsed.data : [];
}

function key(runId: string, step: string): string {
  return `automation:${runId}:${step}`;
}

function applied(result: IntentResult): boolean {
  return result.outcome.status === "applied";
}

/** One line for a toast: the summary, the denial reason or the error. */
export function describeIntent(result: IntentResult): string {
  const o = result.outcome;
  switch (o.status) {
    case "applied":
      return o.summary;
    case "denied":
      return o.reason;
    case "pending_approval":
      return o.reason;
    case "error":
      return o.message;
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

/**
 * 1. Build and write the immutable context. 2. `dispatch`. 3. Create the Devin
 * session. 4. `record_session` with the id or the failure. A denied dispatch
 * removes the context file again, so `runs/` only ever holds real runs.
 */
export async function dispatchRun(
  actor: Actor,
  req: DispatchRequest,
  deps: BridgeDeps,
): Promise<DispatchOutcome> {
  const spec = getSpec(req.spec);
  if (!spec) throw new Error(`No runnable spec ${req.spec}`);
  const runId = ulid();

  let reverses: { runId: string; mergeCommit: string } | null = null;
  if (req.reverses) {
    const target = getRun(req.reverses);
    if (!target?.mergeCommit) throw new Error(`${req.reverses} has no merge commit to reverse`);
    reverses = { runId: target.id, mergeCommit: target.mergeCommit };
  }

  const built = buildContext({
    runId,
    kind: req.kind,
    spec,
    scope: req.scope,
    intent: req.intent,
    requestedBy: actor.role,
    clusterKey: req.clusterKey,
    evidenceIds: req.evidenceIds,
    reverses,
    repoRoot: deps.repoRoot,
  });

  const dir = runDir(deps.repoRoot, runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "context.json"), built.json);

  const dispatch = executeIntent(actor, {
    tool: "automation",
    action: "dispatch",
    recordId: null,
    input: {
      runId,
      spec: spec.file,
      kind: req.kind,
      scope: req.scope,
      intent: req.intent,
      contextSha256: built.sha256,
      evidenceIds: [...req.evidenceIds],
      reverses: req.reverses ?? null,
    },
    idempotencyKey: key(runId, "dispatch"),
  });
  if (!applied(dispatch)) {
    rmSync(dir, { recursive: true, force: true });
    return { runId, dispatch, session: null, sessionUrl: null };
  }

  let sessionInput: { sessionId: string } | { error: string };
  let sessionUrl: string | null = null;
  if (!deps.devin) {
    sessionInput = { error: "Devin API is not configured: set DEVIN_API_KEY and DEVIN_ORG_ID on the server" };
  } else {
    try {
      const created = await deps.devin.createSession({
        prompt: [
          req.intent,
          `Kind: ${req.kind}. Spec: ${spec.file}. Run: ${runId}.`,
          `Work from the attached runs/${runId}/context.json; commit it unchanged on your branch.`,
        ].join("\n"),
        title: `${req.kind} ${spec.file} (${runId})`,
        tags: [`run:${runId}`, `kind:${req.kind}`],
        attachment: { name: "context.json", body: built.json },
        structuredOutputSchema: STRUCTURED_OUTPUT_JSON_SCHEMA,
        playbookId: deps.playbookId,
        maxAcuLimit: deps.maxAcuLimit,
      });
      sessionInput = { sessionId: created.sessionId };
      sessionUrl = created.url;
    } catch (error) {
      sessionInput = { error: errorText(error) };
    }
  }

  const session = executeIntent(actor, {
    tool: "automation",
    action: "record_session",
    recordId: runId,
    input: sessionInput,
    idempotencyKey: key(runId, "record_session"),
  });
  return { runId, dispatch, session, sessionUrl };
}

export type PollOutcome =
  | { kind: "frame"; frame: ReplayFrame }
  | { kind: "no_output"; status: string; statusDetail: string | null }
  | { kind: "invalid_output"; status: string; issues: string }
  | { kind: "unavailable"; reason: string };

/**
 * Reads the session once and appends a validated frame to `replay.json`.
 * Touches no governed table: a poll is an observation, not a transition.
 */
export async function pollRun(run: DevinRun, deps: BridgeDeps): Promise<PollOutcome> {
  if (!deps.devin) return { kind: "unavailable", reason: "Devin API is not configured" };
  if (!run.sessionId) return { kind: "unavailable", reason: "The run has no session" };
  const snapshot = await deps.devin.getSession(run.sessionId);
  if (snapshot.structuredOutput === null || snapshot.structuredOutput === undefined) {
    return { kind: "no_output", status: snapshot.status, statusDetail: snapshot.statusDetail };
  }
  const parsed = StructuredOutput.safeParse(snapshot.structuredOutput);
  if (!parsed.success) {
    return {
      kind: "invalid_output",
      status: snapshot.status,
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  const frame: ReplayFrame = {
    at_ms: (deps.now ?? Date.now)(),
    structured_output: parsed.data,
    status: snapshot.status,
    status_detail: snapshot.statusDetail,
  };
  const dir = runDir(deps.repoRoot, run.id);
  mkdirSync(dir, { recursive: true });
  const frames = [...readReplay(deps.repoRoot, run.id), frame];
  writeFileSync(join(dir, "replay.json"), JSON.stringify(frames, null, 2) + "\n");
  return { kind: "frame", frame };
}

/** The PR a run is working on: the audited one once approved, else the last one the session reported. */
export function currentPrUrl(run: DevinRun, deps: BridgeDeps): string | null {
  if (run.prUrl) return run.prUrl;
  const frames = readReplay(deps.repoRoot, run.id);
  for (let i = frames.length - 1; i >= 0; i--) {
    const url = frames[i].structured_output.pr_url;
    if (url) return url;
  }
  return null;
}

export interface ApproveOutcome {
  approve: IntentResult;
  /** Set when the intent applied but GitHub refused the review. */
  reviewError: string | null;
  checks: string;
}

/**
 * Reads the head's checks and the branch's `context.json` digest from GitHub,
 * hands both to `approve_pr` as server-read inputs, and submits the GitHub
 * review only once that intent has committed.
 */
export async function approveRun(
  actor: Actor,
  run: DevinRun,
  note: string | undefined,
  deps: BridgeDeps,
): Promise<ApproveOutcome> {
  const prUrl = currentPrUrl(run, deps);
  const ref = prUrl ? parsePullUrl(prUrl) : null;
  if (!prUrl || !ref) throw new Error("The session has not reported a pull request yet");
  if (!deps.github) throw new Error("GitHub API is not configured: set GITHUB_TOKEN on the server");

  const pull = await deps.github.getPull(ref);
  const checks = await deps.github.getChecks(ref, pull.headSha);
  const branchContextSha256 =
    (await deps.github.fileSha256(ref, pull.headSha, `runs/${run.id}/context.json`)) ?? "0".repeat(64);

  const approve = executeIntent(actor, {
    tool: "automation",
    action: "approve_pr",
    recordId: run.id,
    input: {
      prUrl,
      checksGreen: checks.green,
      branchContextSha256,
      ...(note ? { note } : {}),
    },
    idempotencyKey: key(run.id, `approve_pr:${pull.headSha}`),
  });
  if (!applied(approve) || approve.replayed) {
    return { approve, reviewError: null, checks: checks.summary };
  }

  let reviewError: string | null = null;
  try {
    await deps.github.approvePull(
      ref,
      pull.headSha,
      `Approved from the ops console for run ${run.id} (context ${run.contextSha256.slice(0, 12)}).`,
    );
    if (deps.devin && run.sessionId) {
      await deps.devin.sendMessage(run.sessionId, `Run ${run.id} is approved. Merge ${prUrl} now.`);
    }
  } catch (error) {
    reviewError = errorText(error);
  }
  return { approve, reviewError, checks: checks.summary };
}

export type MergeOutcome =
  | { kind: "merged"; record: IntentResult; mergeCommit: string }
  | { kind: "open"; prUrl: string }
  | { kind: "unavailable"; reason: string };

/** Observes the PR on GitHub; only an actual merge produces `record_merge`. */
export async function observeMerge(actor: Actor, run: DevinRun, deps: BridgeDeps): Promise<MergeOutcome> {
  const prUrl = run.prUrl;
  const ref = prUrl ? parsePullUrl(prUrl) : null;
  if (!prUrl || !ref) return { kind: "unavailable", reason: "The run has no approved pull request" };
  if (!deps.github) return { kind: "unavailable", reason: "GitHub API is not configured" };
  const pull = await deps.github.getPull(ref);
  if (!pull.merged || !pull.mergeCommit) return { kind: "open", prUrl };
  const record = executeIntent(actor, {
    tool: "automation",
    action: "record_merge",
    recordId: run.id,
    input: { mergeCommit: pull.mergeCommit, prUrl },
    idempotencyKey: key(run.id, `record_merge:${pull.mergeCommit}`),
  });
  return { kind: "merged", record, mergeCommit: pull.mergeCommit };
}

export type SyncOutcome =
  | { kind: "synced"; before: string; after: string; migrated: boolean }
  | { kind: "unchanged"; head: string }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string };

/** One line for a toast: what the pull into the local checkout did. */
export function describeSync(sync: SyncOutcome): string {
  switch (sync.kind) {
    case "synced":
      return `pulled ${sync.before.slice(0, 7)} → ${sync.after.slice(0, 7)}${sync.migrated ? " · db migrated" : ""}`;
    case "unchanged":
      return `checkout already at ${sync.head.slice(0, 7)}`;
    case "skipped":
      return `pull skipped: ${sync.reason}`;
    case "failed":
      return `pull failed: ${sync.reason}`;
  }
}

/**
 * Serialised through `syncQueue` so two clicks never run two pulls. Only a
 * `merged` run pulls: the checkout must sit on the sync branch with a clean
 * tree, the pull is `--ff-only`, and the run's merge commit must land on
 * HEAD. A drizzle diff additionally runs `pnpm db:migrate` — never
 * `db:setup`/`db:seed`, which re-seed the live database (MERGE_SYNC.md).
 */
export function syncMergedRun(run: DevinRun, deps: BridgeDeps): Promise<SyncOutcome> {
  const next = syncQueue.then(() => syncMergedRunInner(run, deps));
  syncQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

let syncQueue: Promise<unknown> = Promise.resolve();

async function syncMergedRunInner(run: DevinRun, deps: BridgeDeps): Promise<SyncOutcome> {
  const git = deps.git;
  if (!git) return { kind: "skipped", reason: "git sync not configured" };
  if (run.status !== "merged") return { kind: "skipped", reason: `run is ${run.status}, not merged` };
  if (!run.mergeCommit) return { kind: "skipped", reason: "run has no merge commit" };
  const cwd = deps.repoRoot;
  const branch = deps.syncBranch ?? SYNC_BRANCH;
  try {
    if ((await git.currentBranch(cwd)) !== branch) {
      return { kind: "skipped", reason: `checkout is not on ${branch}` };
    }
    if (!(await git.isClean(cwd))) {
      return { kind: "skipped", reason: "working tree has uncommitted changes" };
    }
    const before = await git.head(cwd);
    await git.pullFfOnly(cwd, deps.syncRemote ?? SYNC_REMOTE, branch);
    const after = await git.head(cwd);
    if (!(await git.isAncestor(cwd, run.mergeCommit, "HEAD"))) {
      return { kind: "failed", reason: `${run.mergeCommit.slice(0, 12)} is not on HEAD after the pull` };
    }
    if (after === before) return { kind: "unchanged", head: after };
    const paths = await git.changedPaths(cwd, before, after);
    let migrated = false;
    if (deps.migrate && paths.some((p) => p.startsWith("apps/console/drizzle/"))) {
      await deps.migrate(cwd);
      migrated = true;
    }
    return { kind: "synced", before, after, migrated };
  } catch (error) {
    return { kind: "failed", reason: errorText(error) };
  }
}

/** True when the local checkout already contains the run's merge commit. */
export async function isMergeLocal(run: DevinRun, deps: BridgeDeps): Promise<boolean> {
  if (!deps.git || !run.mergeCommit) return false;
  return deps.git.isAncestor(deps.repoRoot, run.mergeCommit, "HEAD");
}

export interface ReconcileOutcome {
  /** Approved runs whose PR was read on GitHub. */
  checked: number;
  /** How many of those GitHub reported merged. */
  merged: number;
  /** The pull for the newest merge, or null when nothing merged. */
  sync: SyncOutcome | null;
}

/**
 * Reads every `approved` run's PR on GitHub and records the merges. State
 * stays in `devin_runs`: GitHub is consulted to confirm, never to rebuild.
 * One pull follows for the newest merge.
 */
export async function reconcileRuns(actor: Actor, deps: BridgeDeps): Promise<ReconcileOutcome> {
  const { rows } = automationTool.list({ filters: { status: "approved" }, limit: 100, offset: 0 });
  let merged = 0;
  let newest: DevinRun | null = null;
  for (const row of rows) {
    const run = getRun(row.id);
    if (!run) continue;
    const outcome = await observeMerge(actor, run, deps);
    if (outcome.kind !== "merged") continue;
    const after = getRun(run.id);
    if (!after || after.status !== "merged") continue;
    merged += 1;
    if (!newest || after.updatedAt >= newest.updatedAt) newest = after;
  }
  const sync = newest ? await syncMergedRun(newest, deps) : null;
  return { checked: rows.length, merged, sync };
}

export interface StopOutcome {
  stop: IntentResult;
  /** Set when the session could not be terminated; the run is still stopped. */
  terminateError: string | null;
}

/**
 * Terminates the session, then records `stop` with the operator's reason. The
 * same policy the intent runs is previewed first, so a stop the console would
 * deny never reaches the terminate endpoint.
 */
export async function stopRun(
  actor: Actor,
  run: DevinRun,
  reason: string,
  deps: BridgeDeps,
): Promise<StopOutcome> {
  const preview = previewActions(automationTool, run, actor, { stop: { reason } }).find(
    (p) => p.action === "stop",
  );
  const permitted = preview?.offered === true && preview.decision?.effect === "allow";
  let terminateError: string | null = null;
  if (permitted && run.sessionId && deps.devin) {
    try {
      await deps.devin.terminateSession(run.sessionId);
    } catch (error) {
      terminateError = errorText(error);
    }
  }
  const stop = executeIntent(actor, {
    tool: "automation",
    action: "stop",
    recordId: run.id,
    input: { reason: terminateError ? `${reason} (terminate failed: ${terminateError})`.slice(0, 500) : reason },
    idempotencyKey: key(run.id, `stop:${(deps.now ?? Date.now)()}`),
  });
  return { stop, terminateError };
}
