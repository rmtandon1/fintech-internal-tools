import Link from "next/link";
import { redirect } from "next/navigation";
import { Panel } from "@/components/panel";
import { RefreshInFlight } from "@/components/refresh-in-flight";
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
  type DevinRun,
  getSpec,
  isInFlight,
  listRuns,
  operationLabel,
  operationsStartableBy,
  reversingRun,
} from "@console/tool-automation";
import { prNumberFromUrl } from "@console/tool-automation/removal-preview";
import { roleLabel, ROLES, type Role } from "@console/permissions";
import { devinMode } from "@/lib/devin-status";
import { pageNumber } from "@/lib/page-number";
import { currentActor } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLE_NAMES: readonly string[] = ROLES;

function requesterLabel(role: string): string {
  return ROLE_NAMES.includes(role) ? roleLabel(role as Role) : role;
}

/** Whether this merged change may be removed by the viewer: the "Remove this rule" dialog reads the rest. */
function removable(run: DevinRun, actor: Actor): boolean {
  const spec = getSpec(run.spec);
  return (
    spec !== undefined &&
    run.status === "merged" &&
    run.operation === "change" &&
    run.mergeCommit !== null &&
    reversingRun(run.id) === null &&
    operationsStartableBy(actor.role, spec).includes("undo")
  );
}

const PAGE_SIZE = 50;

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await currentActor();
  if (!AUTOMATION_ROLES.includes(actor.role)) redirect("/");
  const total = countRuns();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, pageNumber((await searchParams).page));
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
                operationLabel: operationLabel(run.operation),
                requesterLabel: requesterLabel(run.requestedByRole),
                prNumber: prNumberFromUrl(run.prUrl),
                ruleName: getSpec(run.spec)?.ruleName ?? null,
              }}
              statuses={automationTool.statuses}
              removable={removable(run, actor)}
              devinConnected={devinMode() === "live"}
            />
          ))}
        </TableBody>
      </Table>
      {runs.some((run) => isInFlight(run.status)) ? (
        <RefreshInFlight
          runIds={runs.filter((run) => isInFlight(run.status)).map((run) => run.id)}
        />
      ) : null}
    </Panel>
  );
}
