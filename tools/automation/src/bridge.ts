import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import type { Actor, IntentResult } from "@console/engine/types";
import { buildContext } from "./context";
import type { DevinClient } from "./devin-api";
import { type GitHubClient, parsePullUrl } from "./github-api";
import { automationTool, getRun, type DevinRun } from "./index";
import { ContextFile, STRUCTURED_OUTPUT_JSON_SCHEMA, StructuredOutput } from "./run-files";
import { getSpec, type RunKind, type RunScope } from "./specs";

/**
 * The bridge between the governed `automation` actions and the outside world.
 * Every database change here is an `executeIntent` call; the Devin and GitHub
 * calls happen strictly after the intent they depend on has committed, or
 * strictly before the intent that records what they returned. Polled session
 * progress is read from the session and never written to `devin_runs`
 * (DEVIN_RUN_PROTOCOL.md § Progress).
 */

export interface BridgeDeps {
  /** Null when `DEVIN_API_KEY` / `DEVIN_ORG_ID` are not set on the server. */
  devin: DevinClient | null;
  /** Null when `GITHUB_TOKEN` is not set on the server. */
  github: GitHubClient | null;
  /** Repository root: `runs/<id>/` is written under it and git is read from it. */
  repoRoot: string;
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

/** The cluster a run's `context.json` was built from, or null when it is missing or malformed. */
function contextClusterKey(repoRoot: string, runId: string): string | null {
  const raw = readContextJson(repoRoot, runId);
  if (!raw) return null;
  const parsed = ContextFile.safeParse(JSON.parse(raw));
  if (!parsed.success) return null;
  const at = parsed.data.evidence.cluster.indexOf(":");
  return at < 0 ? null : parsed.data.evidence.cluster.slice(at + 1) || null;
}

export function readContextJson(repoRoot: string, runId: string): string | null {
  const path = join(runDir(repoRoot, runId), "context.json");
  return existsSync(path) ? readFileSync(path, "utf8") : null;
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
  let clusterKey = req.clusterKey;
  if (req.reverses) {
    const target = getRun(req.reverses);
    if (!target?.mergeCommit) throw new Error(`${req.reverses} has no merge commit to reverse`);
    reverses = { runId: target.id, mergeCommit: target.mergeCommit };
    // A reversal's evidence is the merged run's, never the caller's.
    clusterKey = contextClusterKey(deps.repoRoot, target.id) ?? "";
  }

  const built = buildContext({
    runId,
    kind: req.kind,
    spec,
    scope: req.scope,
    intent: req.intent,
    requestedBy: actor.role,
    clusterKey,
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
  | { kind: "output"; structuredOutput: StructuredOutput; status: string; statusDetail: string | null }
  | { kind: "no_output"; status: string; statusDetail: string | null }
  | { kind: "invalid_output"; status: string; issues: string }
  | { kind: "unavailable"; reason: string };

/**
 * Reads the session once and validates its `structured_output`. Touches no
 * governed table and writes no file: a poll is an observation, not a transition.
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
  return {
    kind: "output",
    structuredOutput: parsed.data,
    status: snapshot.status,
    statusDetail: snapshot.statusDetail,
  };
}

/** The PR a run is working on: the audited one once approved, else the one the session reports now. */
export async function currentPrUrl(run: DevinRun, deps: BridgeDeps): Promise<string | null> {
  if (run.prUrl) return run.prUrl;
  if (!deps.devin || !run.sessionId) return null;
  const outcome = await pollRun(run, deps);
  return outcome.kind === "output" ? outcome.structuredOutput.pr_url : null;
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
  if (!deps.github) throw new Error("GitHub API is not configured: set GITHUB_TOKEN on the server");
  const prUrl = await currentPrUrl(run, deps);
  const ref = prUrl ? parsePullUrl(prUrl) : null;
  if (!prUrl || !ref) throw new Error("The session has not reported a pull request yet");

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
