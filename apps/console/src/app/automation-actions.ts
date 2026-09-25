"use server";

import "@/app/bootstrap";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRun, RUN_KINDS, RUN_SCOPES } from "@console/tool-automation";
import {
  approveRun,
  describeIntent,
  dispatchRun,
  observeMerge,
  pollRun,
  stopRun,
} from "@console/tool-automation/bridge";
import { bridgeDeps } from "@/lib/bridge";
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
}

const DispatchForm = z.object({
  spec: z.string().min(1),
  kind: z.enum(RUN_KINDS),
  scope: z.enum(RUN_SCOPES),
  intent: z.string().min(1).max(500),
  clusterKey: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
});

export async function dispatchAutomationRun(form: FormData): Promise<BridgeResult> {
  const parsed = DispatchForm.safeParse({
    spec: form.get("spec"),
    kind: form.get("kind"),
    scope: form.get("scope"),
    intent: form.get("intent"),
    clusterKey: form.get("clusterKey"),
    evidenceIds: form.getAll("evidenceIds").map(String),
  });
  if (!parsed.success) {
    return { ok: false, title: "Invalid dispatch", detail: parsed.error.issues[0]?.message };
  }
  const actor = await currentActor();
  try {
    const outcome = await dispatchRun(actor, parsed.data, bridgeDeps());
    revalidatePath("/", "layout");
    if (!outcome.session) {
      return { ok: false, title: "Dispatch denied", detail: describeIntent(outcome.dispatch) };
    }
    const href = `/t/automation/${outcome.runId}`;
    const run = getRun(outcome.runId);
    if (run?.status === "dispatch_failed") {
      return { ok: false, title: "Devin session not created", detail: run.lastNote ?? undefined, href };
    }
    return { ok: true, title: "Run dispatched", detail: describeIntent(outcome.session), href };
  } catch (error) {
    return { ok: false, title: "Dispatch failed", detail: message(error) };
  }
}

export async function pollAutomationRun(runId: string): Promise<BridgeResult> {
  const run = getRun(runId);
  if (!run) return { ok: false, title: "Run not found" };
  try {
    const outcome = await pollRun(run, bridgeDeps());
    revalidatePath(`/t/automation/${runId}`);
    switch (outcome.kind) {
      case "output":
        return {
          ok: true,
          title: `Session ${outcome.status}`,
          detail: `${outcome.structuredOutput.phase} · ${outcome.structuredOutput.phase_status}`,
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
    if (status !== "applied") {
      return {
        ok: false,
        title: status === "denied" ? "Approval denied" : "Approval failed",
        detail: `${describeIntent(outcome.approve)} (${outcome.checks})`,
      };
    }
    if (outcome.reviewError) {
      return { ok: false, title: "Approved, but GitHub review failed", detail: outcome.reviewError };
    }
    return { ok: true, title: "PR approved", detail: outcome.checks };
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
      case "merged":
        return {
          ok: outcome.record.outcome.status === "applied",
          title: outcome.record.outcome.status === "applied" ? "Merge recorded" : "Merge seen, not recorded",
          detail: `${outcome.mergeCommit.slice(0, 12)} · ${describeIntent(outcome.record)}`,
        };
      case "open":
        return { ok: true, title: "Not merged yet", detail: outcome.prUrl };
      case "unavailable":
        return { ok: false, title: "Cannot check merge", detail: outcome.reason };
    }
  } catch (error) {
    return { ok: false, title: "Merge check failed", detail: message(error) };
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
