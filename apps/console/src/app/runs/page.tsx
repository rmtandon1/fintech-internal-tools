import Link from "next/link";
import { redirect } from "next/navigation";
import { Panel } from "@/components/panel";
import { RunRow } from "@/components/run-row";
import {
  Table,
  TableBody,
  TableCell,
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
  kindsStartableBy,
  listRuns,
  reversingRun,
  runKindLabel,
  type RunKind,
} from "@console/tool-automation";
import { roleLabel, ROLES, type Role } from "@console/permissions";
import { type AppBridgeDeps, bridgeDeps } from "@/lib/bridge";
import { buildHandoffOffer, type HandoffOffer, reversalEvidence } from "@/lib/handoff";
import { currentActor } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLE_NAMES: readonly string[] = ROLES;

function requesterLabel(role: string): string {
  return ROLE_NAMES.includes(role) ? roleLabel(role as Role) : role;
}

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
  if (!AUTOMATION_ROLES.includes(actor.role)) redirect("/");
  const deps = bridgeDeps();
  const total = countRuns();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number((await searchParams).page) || 1));
  const runs = listRuns({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <Panel
      className="h-full"
      title={
        <span className="flex items-center gap-2">
          {total} rule change{total === 1 ? "" : "s"} · newest first
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
            <TableHead>Type</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Asked by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Pull request</TableHead>
            <TableHead>Undoes</TableHead>
            <TableHead>Asked</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                Nothing yet. When a queue shows a pattern no rule catches, ask Devin for a rule from there.
              </TableCell>
            </TableRow>
          ) : null}
          {runs.map((run) => (
            <RunRow
              key={run.id}
              run={{
                ...run,
                kindLabel: runKindLabel(run.kind),
                requesterLabel: requesterLabel(run.requestedByRole),
              }}
              statuses={automationTool.statuses}
              reversalOffer={reversalOffer(run.id, actor, deps)}
            />
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
