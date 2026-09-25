"use server";

import "@/app/bootstrap";
import { revalidatePath } from "next/cache";
import { getRun } from "@console/tool-automation";
import {
  approveRun,
  describeIntent,
  describeSync,
  dispatchRun,
  observeMerge,
  observeRun,
  reconcileRuns,
  stopRun,
  syncMergedRun,
} from "@console/tool-automation/bridge";
import { bridgeDeps } from "@/lib/bridge";
import { devinMode } from "@/lib/devin-status";
import { parseDispatchForm } from "@/lib/dispatch-form";
import { reversalEvidence } from "@/lib/handoff";
import { currentActor } from "@/lib/session";

/**
 * Server actions for the Devin bridge. Each one resolves the actor from the
 * signed cookie, runs the bridge with server-read credentials and returns a
 * plain result for a toast; the browser never sees a Devin or GitHub payload.
 */

export interface BridgeResult {
  ok: boolean;
  title: string;
  detail?: string;
  /** Where to go next, e.g. the new run's page after a dispatch. */
  href?: string;
  /** The run a dispatch created, so the caller can focus it in place. */
  runId?: string;
  /** The audit row the intent wrote, when the outcome carries one. */
  auditId?: string;
  /** The client should wait and call the action again (merge check retries). */
  retry?: boolean;
  /** The sync pulled new code: refresh server components. */
  reload?: boolean;
}

export async function dispatchAutomationRun(form: FormData): Promise<BridgeResult> {
  const parsed = parseDispatchForm(form);
  if (!parsed.ok) {
    return { ok: false, title: "Invalid dispatch", detail: parsed.detail };
  }
  // Simulation mode shows a pre-written run in the dialog; a run that never
  // happened must not reach devin_runs or the audit chain.
  if (devinMode() === "simulation") {
    return {
      ok: false,
      title: "Simulation mode",
      detail: "DEVIN_API_KEY is not set, so nothing was dispatched or recorded",
    };
  }
  const actor = await currentActor();
  try {
    const deps = bridgeDeps();
    const evidence =
      parsed.data.kind === "REVERSAL" && parsed.data.reverses
        ? reversalEvidence(deps.repoRoot, parsed.data.reverses)
        : { clusterKey: parsed.data.clusterKey ?? "", evidenceIds: parsed.data.evidenceIds };
    const outcome = await dispatchRun(
      actor,
      { ...parsed.data, ...evidence, reverses: parsed.data.reverses ?? null },
      deps,
    );
    revalidatePath("/", "layout");
    if (!outcome.session) {
      return { ok: false, title: "Dispatch denied", detail: describeIntent(outcome.dispatch) };
    }
    const run = getRun(outcome.runId);
    if (run?.status === "dispatch_failed") {
      return {
        ok: false,
        title: "Devin session not created",
        detail: run.lastNote ?? undefined,
        runId: outcome.runId,
      };
    }
    return {
      ok: true,
      title: "Run dispatched",
      detail: describeIntent(outcome.session),
      runId: outcome.runId,
    };
  } catch (error) {
    return { ok: false, title: "Dispatch failed", detail: message(error) };
  }
}

export async function pollAutomationRun(runId: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Run not found" };
  try {
    const { poll: outcome, record } = await observeRun(actor, run, bridgeDeps());
    revalidatePath(`/t/automation/${runId}`);
    revalidatePath("/runs");
    switch (outcome.kind) {
      case "output":
        return {
          ok: true,
          title: `Session ${outcome.status}`,
          detail: [
            `${outcome.structuredOutput.phase} · ${outcome.structuredOutput.phase_status}`,
            record ? describeIntent(record) : null,
          ]
            .filter((s) => s !== null)
            .join(" · "),
        };
      case "no_output":
        return { ok: true, title: `Session ${outcome.status}`, detail: outcome.statusDetail ?? "No structured output yet" };
      case "invalid_output":
        return { ok: false, title: "Structured output rejected", detail: outcome.issues };
      case "unavailable":
        return { ok: false, title: "Cannot poll", detail: outcome.reason };
    }
  } catch (error) {
    return { ok: false, title: "Poll failed", detail: message(error) };
  }
}

export async function approveAutomationRun(runId: string, note: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Run not found" };
  try {
    const outcome = await approveRun(actor, run, note || undefined, bridgeDeps());
    revalidatePath("/", "layout");
    const status = outcome.approve.outcome.status;
    const auditId =
      "auditId" in outcome.approve.outcome ? outcome.approve.outcome.auditId : undefined;
    if (status !== "applied") {
      return {
        ok: false,
        title: status === "denied" ? "Approval denied" : "Approval failed",
        detail: `${describeIntent(outcome.approve)} (${outcome.checks})`,
        auditId,
      };
    }
    if (outcome.reviewError) {
      return { ok: false, title: "Approved, but GitHub review failed", detail: outcome.reviewError };
    }
    return { ok: true, title: "PR approved", detail: outcome.checks, auditId };
  } catch (error) {
    return { ok: false, title: "Approval failed", detail: message(error) };
  }
}

export async function observeAutomationMerge(runId: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Run not found" };
  try {
    const outcome = await observeMerge(actor, run, bridgeDeps());
    revalidatePath("/", "layout");
    switch (outcome.kind) {
      case "merged": {
        const recorded = outcome.record.outcome.status === "applied";
        const fresh = getRun(runId);
        const sync = recorded && fresh ? await syncMergedRun(fresh, bridgeDeps()) : null;
        revalidatePath("/", "layout");
        let detail = `${outcome.mergeCommit.slice(0, 12)} · ${describeIntent(outcome.record)}`;
        if (sync) {
          detail += ` · ${describeSync(sync)}`;
          if (sync.kind === "synced" && process.env.NODE_ENV === "production") {
            detail += " · rebuild required";
          }
        }
        return {
          ok: recorded,
          title: recorded ? "Merge recorded" : "Merge seen, not recorded",
          detail,
          reload: sync?.kind === "synced",
        };
      }
      case "open":
        return { ok: true, title: "Not merged yet", detail: outcome.prUrl, retry: true };
      case "unavailable":
        return { ok: false, title: "Cannot check merge", detail: outcome.reason };
    }
  } catch (error) {
    return { ok: false, title: "Merge check failed", detail: message(error) };
  }
}

/** Pulls a run's merge into the local checkout; offered once the run is `merged`. */
export async function syncAutomationRun(runId: string): Promise<BridgeResult> {
  const actor = await currentActor();
  if (actor.role !== "engineer") {
    return { ok: false, title: "Sync denied", detail: "Only the engineer may pull merged code" };
  }
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Run not found" };
  try {
    const sync = await syncMergedRun(run, bridgeDeps());
    revalidatePath("/", "layout");
    const ok = sync.kind === "synced" || sync.kind === "unchanged";
    let detail = describeSync(sync);
    if (sync.kind === "synced" && process.env.NODE_ENV === "production") {
      detail += " · rebuild required";
    }
    return {
      ok,
      title: ok ? "Local checkout synced" : "Pull did not run",
      detail,
      reload: sync.kind === "synced",
    };
  } catch (error) {
    return { ok: false, title: "Pull failed", detail: message(error) };
  }
}

/** Confirms every approved run against GitHub, records merges, then pulls once. */
export async function reconcileAutomationRuns(): Promise<BridgeResult> {
  const actor = await currentActor();
  if (actor.role !== "engineer") {
    return { ok: false, title: "Reconcile denied", detail: "Only the engineer may reconcile runs" };
  }
  const deps = bridgeDeps();
  if (!deps.github) {
    return { ok: false, title: "Cannot reconcile", detail: "GitHub API is not configured" };
  }
  try {
    const outcome = await reconcileRuns(actor, deps);
    revalidatePath("/", "layout");
    const sync = outcome.sync;
    let detail = `${outcome.merged} merged`;
    if (sync) {
      detail += ` · ${describeSync(sync)}`;
      if (sync.kind === "synced" && process.env.NODE_ENV === "production") {
        detail += " · rebuild required";
      }
    }
    return {
      ok: true,
      title: `Reconciled ${outcome.checked} approved run(s)`,
      detail,
      reload: sync?.kind === "synced",
    };
  } catch (error) {
    return { ok: false, title: "Reconcile failed", detail: message(error) };
  }
}

export async function stopAutomationRun(runId: string, reason: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Run not found" };
  try {
    const outcome = await stopRun(actor, run, reason, bridgeDeps());
    revalidatePath("/", "layout");
    const ok = outcome.stop.outcome.status === "applied";
    return {
      ok,
      title: ok ? "Run stopped" : "Stop denied",
      detail: outcome.terminateError
        ? `Session terminate failed: ${outcome.terminateError}`
        : describeIntent(outcome.stop),
    };
  } catch (error) {
    return { ok: false, title: "Stop failed", detail: message(error) };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
