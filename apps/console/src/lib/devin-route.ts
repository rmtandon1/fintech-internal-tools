import { DEMO_ACTORS } from "@console/engine/actor";
import { listAuditEvents } from "@console/engine/audit/query";
import type { Actor } from "@console/engine/types";
import {
  AUTOMATION_ROLES,
  type DevinRun,
  getRun,
  getSpec,
  IN_FLIGHT_STATUSES,
  type ReplayFrame,
  type RunKind,
  type RunStatus,
} from "@console/tool-automation";
import { observeMerge, pollRun, readReplay } from "@console/tool-automation/bridge";
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

  // A poll is observational: it appends a frame and writes no run state.
  if (run.sessionId && IN_FLIGHT_STATUSES.includes(run.status as RunStatus)) {
    await pollRun(run, deps).catch(() => null);
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
    offers: runOffers(run, actor, deps, latest?.structured_output ?? null),
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
  await deps.devin.sendMessage(run.sessionId, message);
  return { status: 200, body: { ok: true } };
}
