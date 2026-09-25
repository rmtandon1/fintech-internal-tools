import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { DispatchControl } from "@/components/dispatch-control";
import { Panel } from "@/components/panel";
import { requesterLabel } from "@/components/run-summary";
import { bridgeDeps } from "@/lib/bridge";
import { devinMode } from "@/lib/devin-status";
import { simulationsFor } from "@/lib/simulation";
import { currentActor } from "@/lib/session";
import {
  automationTool,
  type DevinRun,
  getSpec,
  countRuns,
  isInFlight,
  kindsStartableBy,
  listRuns,
} from "@console/tool-automation";
import { type BridgeDeps, pollRun } from "@console/tool-automation/bridge";
import type { Actor } from "@console/engine/types";
import { formatRelative } from "@console/ui/format";
import { StatusChip } from "@console/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@console/ui/table";

const PAGE_SIZE = 50;

interface RowState {
  phase: string | null;
  /** The approved PR, or the one the session has reported ahead of approval. */
  prUrl: string | null;
}

/**
 * An in-flight run is polled once per render so its row shows the phase the
 * session last reported. A poll is an observation: it writes nothing, and a
 * failed one leaves the row on the stored status alone.
 */
async function rowState(run: DevinRun, deps: BridgeDeps): Promise<RowState> {
  if (!isInFlight(run.status) || !run.sessionId) return { phase: null, prUrl: run.prUrl };
  const polled = await pollRun(run, deps).catch(() => null);
  const out = polled?.kind === "output" ? polled.structuredOutput : null;
  return {
    phase: out ? `${out.phase} · ${out.phase_status}` : null,
    prUrl: run.prUrl ?? out?.pr_url ?? null,
  };
}

function pageNumber(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Admins may undo a merged implementation; the spec fixes the intent. */
function reversalOffer(run: DevinRun, actor: Actor) {
  if (run.status !== "merged" || run.kind === "REVERSAL" || !run.mergeCommit) return null;
  const spec = getSpec(run.spec);
  if (!spec || !kindsStartableBy(actor.role, spec).includes("REVERSAL")) return null;
  const intent = spec.intents.REVERSAL;
  if (!intent) return null;
  return {
    spec: spec.file,
    clusterKey: "",
    evidenceIds: [],
    kinds: [{ kind: "REVERSAL", intent }],
    reverses: run.id,
    simulations: devinMode() === "simulation" ? simulationsFor(spec.file, ["REVERSAL"]) : null,
  };
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await currentActor();
  if (!automationTool.visibleTo.includes(actor.role)) redirect("/");

  const total = countRuns();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageNumber((await searchParams).page), pages);
  const rows = listRuns({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const deps = bridgeDeps();
  const states = new Map<string, RowState>();
  for (const run of rows) states.set(run.id, await rowState(run, deps));
  const anyInFlight = rows.some((run) => isInFlight(run.status) && run.sessionId);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {anyInFlight ? <AutoRefresh everyMs={5000} /> : null}
      <Panel
        title="Runs"
        bodyClassName="p-0"
        actions={
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Kind</TableHead>
              <TableHead className="text-[11px]">Intent</TableHead>
              <TableHead className="hidden text-[11px] md:table-cell">Requester</TableHead>
              <TableHead className="text-[11px]">Status</TableHead>
              <TableHead className="hidden text-[11px] lg:table-cell">PR</TableHead>
              <TableHead className="hidden text-[11px] lg:table-cell">Reverses</TableHead>
              <TableHead className="text-[11px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                  No runs yet. Open a cluster and ask Devin for a rule.
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((run) => {
              const { phase, prUrl } = states.get(run.id) ?? { phase: null, prUrl: run.prUrl };
              const reversal = reversalOffer(run, actor);
              const inFlight = isInFlight(run.status);
              return (
                <TableRow key={run.id} data-testid="run-row" data-run-id={run.id}>
                  <TableCell className="whitespace-nowrap font-mono text-[11px]">
                    <Link href={`/t/automation/${run.id}`} className="hover:underline">
                      {run.kind}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[28rem] text-xs">
                    <Link href={`/t/automation/${run.id}`} className="line-clamp-2 hover:underline">
                      {run.intent}
                    </Link>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground md:hidden">
                      {requesterLabel(run)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs md:table-cell">
                    <span className="block">{requesterLabel(run)}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {formatRelative(run.requestedAt)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    <span className="flex flex-col gap-0.5">
                      <StatusChip value={run.status} statuses={automationTool.statuses} />
                      {inFlight && phase ? (
                        <span className="font-mono text-[10px] text-muted-foreground">{phase}</span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden font-mono text-[11px] lg:table-cell">
                    {prUrl ? (
                      <a href={prUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        #{prUrl.split("/").pop()}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-[11px] lg:table-cell">
                    {run.reverses ? (
                      <Link href={`/t/automation/${run.reverses}`} className="hover:underline">
                        {run.reverses.slice(0, 10)}…
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {reversal ? (
                      <DispatchControl offer={reversal} label="Reverse this change" variant="outline" />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
