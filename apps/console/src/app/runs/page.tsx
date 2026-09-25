import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/panel";
import { RefreshInFlight } from "@/components/refresh-in-flight";
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
  countRuns,
  getRun,
  getSpec,
  IMPLEMENTATION_KINDS,
  isInFlight,
  kindsStartableBy,
  listRuns,
  reversingRun,
  type RunKind,
} from "@console/tool-automation";
import { type AppBridgeDeps, bridgeDeps } from "@/lib/bridge";
import { buildHandoffOffer, type HandoffOffer, reversalEvidence } from "@/lib/handoff";
import { pageNumber } from "@/lib/page-number";
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

const PAGE_SIZE = 50;

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await currentActor();
  if (!AUTOMATION_ROLES.includes(actor.role)) notFound();
  const deps = bridgeDeps();
  const total = countRuns();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, pageNumber((await searchParams).page));
  const runs = listRuns({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <Panel
      className="h-full"
      title={
        <span className="flex items-center gap-2">
          {total} run{total === 1 ? "" : "s"} · newest first
          {pages > 1 ? (
            <span className="flex items-center gap-1">
              {page > 1 ? (
                <Link href={`/runs?page=${page - 1}`} className="hover:text-foreground">
                  ‹ Newer
                </Link>
              ) : null}
              <span className="tabular-nums">
                {page}/{pages}
              </span>
              {page < pages ? (
                <Link href={`/runs?page=${page + 1}`} className="hover:text-foreground">
                  Older ›
                </Link>
              ) : null}
            </span>
          ) : null}
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
      {runs.some((run) => isInFlight(run.status)) ? <RefreshInFlight /> : null}
    </Panel>
  );
}
