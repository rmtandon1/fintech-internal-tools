import Link from "next/link";
import { SimulatedRunView, SimulationBanner } from "@/components/simulated-run";
import type { DevinMode } from "@/lib/devin-status";
import { defaultSimulation } from "@/lib/simulation";
import type { Actor } from "@console/engine/types";
import { automationTool, listRuns, runKindLabel } from "@console/tool-automation";
import { formatRelative } from "@console/ui/format";
import { StatusChip } from "@console/ui/status-chip";

const RECENT = 5;

/**
 * What the Devin window holds. Live: the newest runs from `devin_runs`, each
 * linking to its run view. Simulation: the pre-written finished run, labelled
 * as such, because there is no session to read.
 */
export function DevinWindowBody({ actor, mode }: { actor: Actor; mode: DevinMode }) {
  if (mode === "simulation") {
    return (
      <div className="space-y-3 p-3">
        <SimulationBanner />
        <SimulatedRunView run={defaultSimulation()} />
      </div>
    );
  }

  const canSee = automationTool.visibleTo.includes(actor.role);
  const runs = canSee ? listRuns({ limit: RECENT }) : [];
  return (
    <div className="space-y-3 p-3 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <span className="size-2 rounded-full bg-emerald-400" />
        Connected to Devin.
        <a
          href="/api/devin/status"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs underline-offset-4 hover:text-foreground hover:underline"
        >
          Check connection
        </a>
      </p>
      {!canSee ? (
        <p className="text-muted-foreground">
          Managers, engineers and admins can see the rule changes Devin is working on.
        </p>
      ) : runs.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing yet. When a queue shows a pattern no rule catches, ask Devin for a rule from
          there.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border" data-testid="devin-window-runs">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <StatusChip value={run.status} statuses={automationTool.statuses} />
              <Link href={`/t/automation/${run.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {run.intent}
              </Link>
              <span className="text-xs text-muted-foreground">{runKindLabel(run.kind)}</span>
              <span className="text-xs text-muted-foreground">{formatRelative(run.requestedAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {canSee ? (
        <Link href="/runs" className="inline-block text-muted-foreground underline">
          All rule changes
        </Link>
      ) : null}
    </div>
  );
}
