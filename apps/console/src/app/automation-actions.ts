"use server";

import "@/app/bootstrap";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRun, RUN_KINDS, RUN_SCOPES } from "@console/tool-automation";
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

const DispatchForm = z.object({
  spec: z.string().min(1),
  kind: z.enum(RUN_KINDS),
  scope: z.enum(RUN_SCOPES),
  intent: z.string().min(1).max(500),
  /** Optional on a REVERSAL: derived from the reversed run's context.json. */
  clusterKey: z.string().min(1).optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
  reverses: z.string().min(1).optional(),
});

export async function dispatchAutomationRun(form: FormData): Promise<BridgeResult> {
  const parsed = DispatchForm.safeParse({
    spec: form.get("spec"),
    kind: form.get("kind"),
    scope: form.get("scope"),
    intent: form.get("intent"),
    clusterKey: form.get("clusterKey") ?? undefined,
    evidenceIds: form.getAll("evidenceIds").map(String),
    reverses: form.get("reverses") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, title: "Request not sent", detail: parsed.error.issues[0]?.message };
  }
  if (parsed.data.kind === "REVERSAL" ? !parsed.data.reverses : !parsed.data.clusterKey || parsed.data.evidenceIds.length === 0) {
    return {
      ok: false,
      title: "Request not sent",
      detail:
        parsed.data.kind === "REVERSAL"
          ? "Name the change to undo"
          : "Ask from a pattern in the queue and include at least one example",
    };
  }
  // Simulation mode shows a pre-written run in the dialog; a run that never
  // happened must not reach devin_runs or the audit chain.
  if (devinMode() === "simulation") {
    return {
      ok: false,
      title: "Preview only",
      detail: "Devin isn't connected, so nothing was sent or recorded",
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
      return { ok: false, title: "Request not allowed", detail: describeIntent(outcome.dispatch) };
    }
    const run = getRun(outcome.runId);
    if (run?.status === "dispatch_failed") {
      return {
        ok: false,
        title: "Devin couldn't start",
        detail: run.lastNote ?? undefined,
        runId: outcome.runId,
      };
    }
    return {
      ok: true,
      title: "Sent to Devin",
      detail: describeIntent(outcome.session),
      runId: outcome.runId,
    };
  } catch (error) {
    return { ok: false, title: "Request failed", detail: message(error) };
  }
}

export async function pollAutomationRun(runId: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Rule change not found" };
  try {
    const { poll: outcome, record } = await observeRun(actor, run, bridgeDeps());
    revalidatePath(`/t/automation/${runId}`);
    revalidatePath("/runs");
    switch (outcome.kind) {
      case "output":
        return {
          ok: true,
          title: `Devin: ${outcome.status.replace(/_/g, " ")}`,
          detail: [
            `${outcome.structuredOutput.phase} · ${outcome.structuredOutput.phase_status}`,
            record ? describeIntent(record) : null,
          ]
            .filter((s) => s !== null)
            .join(" · "),
        };
      case "no_output":
        return { ok: true, title: `Devin: ${outcome.status.replace(/_/g, " ")}`, detail: outcome.statusDetail ?? "No progress reported yet" };
      case "invalid_output":
        return { ok: false, title: "Devin's progress report couldn't be read", detail: outcome.issues };
      case "unavailable":
        return { ok: false, title: "Can't check status", detail: outcome.reason };
    }
  } catch (error) {
    return { ok: false, title: "Status check failed", detail: message(error) };
  }
}

export async function approveAutomationRun(runId: string, note: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Rule change not found" };
  try {
    const outcome = await approveRun(actor, run, note || undefined, bridgeDeps());
    revalidatePath("/", "layout");
    const status = outcome.approve.outcome.status;
    const auditId =
      "auditId" in outcome.approve.outcome ? outcome.approve.outcome.auditId : undefined;
    if (status !== "applied") {
      return {
        ok: false,
        title: status === "denied" ? "Approval not allowed" : "Approval failed",
        detail: `${describeIntent(outcome.approve)} (${outcome.checks})`,
        auditId,
      };
    }
    if (outcome.reviewError) {
      return { ok: false, title: "Approved here, but the GitHub review didn't post", detail: outcome.reviewError };
    }
    return { ok: true, title: "Change approved", detail: outcome.checks, auditId };
  } catch (error) {
    return { ok: false, title: "Approval failed", detail: message(error) };
  }
}

export async function observeAutomationMerge(runId: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Rule change not found" };
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
          title: recorded ? "Now live" : "Merged on GitHub, not yet recorded here",
          detail,
          reload: sync?.kind === "synced",
        };
      }
      case "open":
        return { ok: true, title: "Not live yet", detail: outcome.prUrl, retry: true };
      case "unavailable":
        return { ok: false, title: "Can't check", detail: outcome.reason };
    }
  } catch (error) {
    return { ok: false, title: "Check failed", detail: message(error) };
  }
}

/** Pulls a run's merge into the local checkout; offered once the run is `merged`. */
export async function syncAutomationRun(runId: string): Promise<BridgeResult> {
  const actor = await currentActor();
  if (actor.role !== "engineer") {
    return { ok: false, title: "Not allowed", detail: "Only an engineer can update the local code" };
  }
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Rule change not found" };
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
      title: ok ? "Local code updated" : "Local code not updated",
      detail,
      reload: sync.kind === "synced",
    };
  } catch (error) {
    return { ok: false, title: "Update failed", detail: message(error) };
  }
}

/** Confirms every approved run against GitHub, records merges, then pulls once. */
export async function reconcileAutomationRuns(): Promise<BridgeResult> {
  const actor = await currentActor();
  if (actor.role !== "engineer") {
    return { ok: false, title: "Not allowed", detail: "Only an engineer can sync with GitHub" };
  }
  const deps = bridgeDeps();
  if (!deps.github) {
    return { ok: false, title: "Can't sync", detail: "GitHub isn't connected" };
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
      title: `Synced ${outcome.checked} approved change${outcome.checked === 1 ? "" : "s"}`,
      detail,
      reload: sync?.kind === "synced",
    };
  } catch (error) {
    return { ok: false, title: "Sync failed", detail: message(error) };
  }
}

export async function stopAutomationRun(runId: string, reason: string): Promise<BridgeResult> {
  const actor = await currentActor();
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Rule change not found" };
  try {
    const outcome = await stopRun(actor, run, reason, bridgeDeps());
    revalidatePath("/", "layout");
    const ok = outcome.stop.outcome.status === "applied";
    return {
      ok,
      title: ok ? "Devin stopped" : "Can't stop",
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
