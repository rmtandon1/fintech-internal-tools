import { notFound } from "next/navigation";
import { Panel } from "@/components/panel";
import { RunRow } from "@/components/run-row";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@console/ui/table";
import type { Actor } from "@console/engine/types";
import {
  AUTOMATION_ROLES,
  automationTool,
  getRun,
  getSpec,
  IMPLEMENTATION_KINDS,
  kindsStartableBy,
  reversingRun,
  type DevinRun,
  type RunKind,
} from "@console/tool-automation";
import { type AppBridgeDeps, bridgeDeps } from "@/lib/bridge";
import { buildHandoffOffer, type HandoffOffer, reversalEvidence } from "@/lib/handoff";
import { currentActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A REVERSAL handoff for this row, or null when the row can't be reversed. */
function reversalOffer(runId: string, actor: Actor, deps: AppBridgeDeps): HandoffOffer | null {
  const run = getRun(runId);
  const spec = run ? getSpec(run.spec) : undefined;
  if (
    !run ||
    !spec ||
    run.status !== "merged" ||
    !IMPLEMENTATION_KINDS.includes(run.kind as RunKind) ||
    !run.mergeCommit ||
    reversingRun(run.id) ||
    !kindsStartableBy(actor.role, spec).includes("REVERSAL")
  ) {
    return null;
  }
  try {
    const evidence = reversalEvidence(deps.repoRoot, run.id);
    return buildHandoffOffer(
      spec,
      "REVERSAL",
      actor,
      {
        ...evidence,
        reverses: { runId: run.id, mergeCommit: run.mergeCommit, prUrl: run.prUrl },
      },
      deps,
    );
  } catch {
    return null;
  }
}

export default async function RunsPage() {
  const actor = await currentActor();
  if (!AUTOMATION_ROLES.includes(actor.role)) notFound();
  const deps = bridgeDeps();
  const { rows } = automationTool.list({ filters: {}, limit: 200, offset: 0 });
  const runs = rows as DevinRun[];

  return (
    <Panel
      className="h-full"
      title={
        <span>
          Runs · <span className="tabular-nums">{rows.length}</span>
        </span>
      }
      bodyClassName="p-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Intent</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>PR</TableHead>
            <TableHead>Reverses</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              statuses={automationTool.statuses}
              reversalOffer={reversalOffer(run.id, actor, deps)}
            />
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
