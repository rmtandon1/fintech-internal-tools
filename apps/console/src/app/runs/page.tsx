import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/panel";
import { RunRow } from "@/components/run-row";
import { StatusChip } from "@console/ui/status-chip";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@console/ui/table";
import { formatRelative } from "@console/ui/format";
import type { Actor } from "@console/engine/types";
import {
  AUTOMATION_ROLES,
  automationTool,
  getRun,
  getSpec,
  IMPLEMENTATION_KINDS,
  kindsStartableBy,
  reversingRun,
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
          {rows.map((run) => (
            <RunRow
              key={run.id}
              runId={run.id}
              reversalOffer={reversalOffer(run.id, actor, deps)}
              cells={[
                <span key="k" className="font-mono text-[11px]">
                  {run.kind}
                </span>,
                <span key="i" className="block max-w-64 truncate">
                  {run.intent}
                </span>,
                <span key="r">{run.requestedByRole}</span>,
                <StatusChip key="s" value={run.status} statuses={automationTool.statuses} />,
                run.prUrl ? (
                  <a
                    key="p"
                    href={run.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[11px] hover:underline"
                  >
                    #{run.prUrl.match(/pull\/(\d+)/)?.[1] ?? "pr"}
                  </a>
                ) : (
                  "—"
                ),
                run.reverses ? (
                  <Link
                    key="v"
                    href={`/t/automation/${run.reverses}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[11px] hover:underline"
                  >
                    {run.reverses.slice(-6)}
                  </Link>
                ) : (
                  "—"
                ),
                <span key="t" className="text-muted-foreground">
                  {formatRelative(run.requestedAt)}
                </span>,
              ]}
            />
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
