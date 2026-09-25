import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@console/ui/icon";
import { ContextDrawer } from "@/components/context-drawer";
import {
  LinkedActivityBody,
  LinkedActivitySummaryLine,
} from "@/components/linked-activity";
import { Panel } from "@/components/panel";
import { RecordView } from "@/components/record-view";
import { RunActions, type RunOffer } from "@/components/run-actions";
import { RunFiles } from "@/components/run-files";
import { StatusChip } from "@console/ui/status-chip";
import { previewActions } from "@console/engine/policy/preview";
import type { Actor } from "@console/engine/types";
import { automationTool, getRun } from "@console/tool-automation";
import { currentPrUrl, isSynced, readContextJson } from "@console/tool-automation/bridge";
import { bridgeDeps } from "@/lib/bridge";
import { currentActor } from "@/lib/session";
import { getTool } from "@/registry";

/**
 * A Devin run replaces the generic action bar: `approve_pr`'s checks and
 * digest inputs are read from GitHub on the server, so the browser never
 * gets a form for them. The offers below gate the buttons with the same
 * policy preview the generic bar uses; the server re-evaluates on click.
 */
async function runSurface(
  id: string,
  actor: Actor,
): Promise<{ offer: RunOffer; files: React.ReactNode } | null> {
  const run = getRun(id);
  if (!run) return null;
  const deps = bridgeDeps();
  const prUrl = await currentPrUrl(run, deps).catch(() => null);
  const previews = previewActions(automationTool, run, actor, {
    approve_pr: {
      prUrl: prUrl ?? "https://github.com/owner/repo/pull/0",
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
  const inFlight = run.status === "running" || run.status === "approved";
  return {
    offer: {
      runId: run.id,
      poll: inFlight && run.sessionId !== null,
      approve: prUrl ? approve : { offered: false, reason: approve.reason ?? "No pull request reported yet" },
      merge: run.status === "approved" && gate("record_merge").offered,
      sync:
        run.status === "merged" && deps.git !== undefined && !(await isSynced(run, deps)),
      stop: gate("stop"),
    },
    files: (
      <RunFiles
        run={run}
        contextPresent={readContextJson(deps.repoRoot, run.id) !== null}
        prUrl={prUrl}
      />
    ),
  };
}

export default async function RecordPage({
  params,
}: {
  params: Promise<{ tool: string; id: string }>;
}) {
  const { tool, id } = await params;
  const decl = getTool(tool);
  const actor = await currentActor();
  if (!decl || !decl.visibleTo.includes(actor.role)) notFound();

  const record = decl.get(id);
  if (!record) notFound();

  const activity = decl.linkedActivity?.(record, actor) ?? null;
  const linked = activity ? getTool(activity.tool) : undefined;
  const run = decl.name === automationTool.name ? await runSurface(id, actor) : null;

  const panel = (
    <Panel
      className="min-h-0 flex-1"
      title={
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <span className="font-mono text-foreground">{record.id}</span>
          <span aria-hidden>·</span>
          <StatusChip
            value={String(record[decl.statusField])}
            statuses={decl.statuses}
          />
          <span aria-hidden>·</span>
          <span className="tabular-nums text-muted-foreground">
            v{record.version}
          </span>
        </span>
      }
    >
      <RecordView
        decl={decl}
        record={record}
        actor={actor}
        actions={run ? <RunActions offer={run.offer} /> : undefined}
        extra={run ? run.files : undefined}
      />
    </Panel>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href={`/t/${decl.name}`} className="hover:text-foreground">
          {decl.displayName}
        </Link>
        <Icon name="ChevronRight" className="size-3" />
        <span className="font-mono">{record.id}</span>
      </div>

      {activity ? (
        <ContextDrawer
          title="Linked activity (same customer)"
          summary={<LinkedActivitySummaryLine activity={activity} />}
          content={
            <LinkedActivityBody activity={activity} linked={linked} actor={actor} />
          }
        >
          {panel}
        </ContextDrawer>
      ) : (
        panel
      )}
    </div>
  );
}
