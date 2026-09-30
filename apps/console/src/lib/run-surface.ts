import { previewActions } from "@console/engine/policy/preview";
import type { Actor } from "@console/engine/types";
import {
  automationTool,
  type DevinRun,
  getSpec,
  operationsStartableBy,
  reversingRun,
  type StructuredOutput,
} from "@console/tool-automation";
import { currentPrUrl, isSynced, type BridgeDeps } from "@console/tool-automation/bridge";
import { touchesSharedPath } from "@console/tool-automation/shared-paths";

/**
 * What the run surface may offer this actor for `run`, computed with the
 * same policy preview the record page's action bar uses. The server
 * re-evaluates every rule on the actual click; these only gate rendering.
 */
export interface RunOffers {
  approve: { offered: boolean; reason?: string };
  stop: { offered: boolean; reason?: string };
  /** The session asked a question; the reply box is offered. */
  reply: boolean;
  /** A merged change the admin may undo. */
  reverse: { offered: boolean; reason?: string };
  /** The merge landed but the local checkout does not have it yet. */
  sync: boolean;
}

/** The shared paths a session-reported diff touched, for the engine-owner note. */
export function sharedPathsTouched(output: StructuredOutput | null | undefined): string[] {
  return (output?.files ?? []).map((f) => f.path).filter(touchesSharedPath);
}

export async function runOffers(
  run: DevinRun,
  actor: Actor,
  deps: BridgeDeps,
  latest?: StructuredOutput | null,
  /** The caller already knows the PR URL (e.g. from the poll it just ran). */
  prUrl?: string | null,
): Promise<RunOffers> {
  const resolved = prUrl !== undefined ? prUrl : await currentPrUrl(run, deps).catch(() => null);
  const previews = previewActions(automationTool, run, actor, {
    approve_pr: {
      prUrl: resolved ?? "https://github.com/owner/repo/pull/0",
      checksGreen: true,
      branchContextSha256: run.contextSha256,
    },
    stop: { reason: "preview" },
  });
  const gate = (action: string): { offered: boolean; reason?: string } => {
    const p = previews.find((x) => x.action === action);
    if (!p?.offered) return { offered: false, reason: p?.unavailableReason };
    if (p.decision?.effect === "deny") return { offered: false, reason: p.decision.reason };
    return { offered: true };
  };
  const approve = gate("approve_pr");

  const spec = getSpec(run.spec);
  const reverse = !spec
    ? { offered: false, reason: "The run's spec is not registered" }
    : run.status !== "merged"
      ? { offered: false, reason: "Only a merged run can be reversed" }
      : run.operation !== "change"
        ? { offered: false, reason: "Only a completed change can be undone" }
        : reversingRun(run.id)
          ? { offered: false, reason: "This run is already undone" }
          : !operationsStartableBy(actor.role, spec).includes("undo")
            ? { offered: false, reason: "Only a manager or admin may undo a change" }
            : { offered: true };

  return {
    approve: resolved ? approve : { offered: false, reason: approve.reason ?? "No pull request yet" },
    stop: gate("stop"),
    reply: latest?.phase_status === "waiting_for_user",
    reverse,
    sync:
      actor.role === "admin" &&
      run.status === "merged" &&
      deps.git !== undefined &&
      !(await isSynced(run, deps).catch(() => false)),
  };
}
