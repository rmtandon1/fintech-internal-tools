import { DEMO_ACTORS } from "@console/engine/actor";
import { listAuditEvents } from "@console/engine/audit/query";
import { previewActions } from "@console/engine/policy/preview";
import type { Actor } from "@console/engine/types";
import {
  AUTOMATION_ROLES,
  automationTool,
  type DevinRun,
  getRun,
  getSpec,
  IN_FLIGHT_STATUSES,
  type ReplayFrame,
  type RunKind,
  type RunStatus,
} from "@console/tool-automation";
import {
  observeMerge,
  observeRun,
  observeSessionEnd,
  type PollOutcome,
  readReplay,
} from "@console/tool-automation/bridge";
import type { AppBridgeDeps } from "@/lib/bridge";
import { runOffers, type RunOffers } from "@/lib/run-surface";

/**
 * The logic behind `app/api/devin/[runId]`, free of Next request objects so
 * tests can drive it with fake deps. Anything returned here is safe for the
 * browser: run fields, frames, and offers — never credentials.
 */
export interface RouteResult {
  status: number;
  body: unknown;
}

/** The run's fields as the browser may see them. */
function publicRun(run: DevinRun) {
  return {
    id: run.id,
    kind: run.kind,
    spec: run.spec,
    tool: run.tool,
    scope: run.scope,
    intent: run.intent,
    status: run.status,
    prUrl: run.prUrl,
    mergeCommit: run.mergeCommit,
    reverses: run.reverses,
    requestedBy: run.requestedBy,
    requestedByRole: run.requestedByRole,
    approvedBy: run.approvedBy,
    lastNote: run.lastNote,
    requestedAt: run.requestedAt,
    updatedAt: run.updatedAt,
  };
}

export interface RunViewPayload {
  mode: AppBridgeDeps["mode"];
  run: ReturnType<typeof publicRun>;
  frames: ReplayFrame[];
  latest: ReplayFrame | null;
  sessionUrl: string | null;
  /** The business sentence for what the run changes once merged. */
  summary: string;
  /** The id of the run's latest audit row, or null before the first intent. */
  lastAuditId: string | null;
  offers: RunOffers;
}

function forbidden(actor: Actor): boolean {
  return !AUTOMATION_ROLES.includes(actor.role);
}

export async function handleGet(
  runId: string,
  actor: Actor,
  deps: AppBridgeDeps,
): Promise<RouteResult> {
  if (forbidden(actor)) return { status: 403, body: { error: "forbidden" } };
  let run = getRun(runId);
  if (!run) return { status: 404, body: { error: "not_found" } };

  // observeRun polls, records the PR once through record_pr and appends a
  // frame; when the poll reports the session has ended without a merge,
  // observeSessionEnd lands the governed stop the run needs.
  let outcome: PollOutcome | null = null;
  if (run.sessionId && IN_FLIGHT_STATUSES.includes(run.status as RunStatus)) {
    const requester =
      Object.values(DEMO_ACTORS).find((a) => a.id === run?.requestedBy) ?? actor;
    const observed = await observeRun(requester, run, deps).catch(() => null);
    if (observed) {
      outcome = observed.poll;
      await observeSessionEnd(requester, run, observed.poll, deps).catch(() => null);
      run = getRun(runId) ?? run;
    }
  }
  // An approved run may have merged since; observe it as the approver.
  if (run.status === "approved") {
    const approver =
      Object.values(DEMO_ACTORS).find((a) => a.id === run?.approvedBy) ?? actor;
    await observeMerge(approver, run, deps).catch(() => null);
    run = getRun(runId) ?? run;
  }

  const frames = readReplay(deps.repoRoot, runId, deps.replaysDir);
  const latest = frames.at(-1) ?? null;
  const payload: RunViewPayload = {
    mode: deps.mode,
    run: publicRun(run),
    frames,
    latest,
    sessionUrl:
      deps.mode === "live" && run.sessionId
        ? `https://app.devin.ai/sessions/${run.sessionId}`
        : null,
    summary: getSpec(run.spec)?.summaries?.[run.kind as RunKind] ?? run.intent,
    lastAuditId: listAuditEvents({ recordId: run.id, limit: 1 }).rows[0]?.id ?? null,
    offers: await runOffers(
      run,
      actor,
      deps,
      latest?.structured_output ?? null,
      // Reuse the URL the poll just reported instead of polling twice.
      run.prUrl ?? (outcome?.kind === "output" ? outcome.structuredOutput.pr_url : null),
    )
  };
  return { status: 200, body: payload };
}

export async function handlePost(
  runId: string,
  actor: Actor,
  deps: AppBridgeDeps,
  body: unknown,
): Promise<RouteResult> {
  if (forbidden(actor)) return { status: 403, body: { error: "forbidden" } };
  const run = getRun(runId);
  if (!run) return { status: 404, body: { error: "not_found" } };
  const message =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : "";
  if (message.length < 1 || message.length > 2000) {
    return { status: 400, body: { error: "message must be 1–2000 characters" } };
  }
  if (!run.sessionId || !deps.devin) {
    return { status: 409, body: { error: "the run has no live session" } };
  }
  if (!(IN_FLIGHT_STATUSES as readonly string[]).includes(run.status)) {
    return { status: 409, body: { error: "the run is not waiting for input" } };
  }
  const latest = readReplay(deps.repoRoot, runId, deps.replaysDir).at(-1);
  if (latest?.structured_output.phase_status !== "waiting_for_user") {
    return { status: 409, body: { error: "the run is not waiting for input" } };
  }
  // Same rule set as `stop`: only an actor who owns the run's domain may
  // write to its session.
  const stopPreview = previewActions(automationTool, run, actor, {
    stop: { reason: "preview" },
  }).find((p) => p.action === "stop");
  if (!stopPreview?.offered || stopPreview.decision?.effect !== "allow") {
    return { status: 403, body: { error: "forbidden" } };
  }
  await deps.devin.sendMessage(run.sessionId, message);
  return { status: 200, body: { ok: true } };
}
