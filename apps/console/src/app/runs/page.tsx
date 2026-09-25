import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { DispatchControl } from "@/components/dispatch-control";
import { Panel } from "@/components/panel";
import { ReplayBadge } from "@/components/replay-badge";
import { requesterLabel } from "@/components/run-summary";
import { bridgeDeps } from "@/lib/bridge";
import { currentActor } from "@/lib/session";
import {
  automationTool,
  type DevinRun,
  getSpec,
  isInFlight,
  kindsStartableBy,
  listRuns,
} from "@console/tool-automation";
import { bridgeMode, pollRun, readReplay } from "@console/tool-automation/bridge";
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

const PAGE_SIZE = 100;

/**
 * An in-flight run is polled once per render so its row shows the phase the
 * session last reported. Polling only writes `replay.json`; a failed poll
 * leaves the row on whatever the last frame said.
 */
async function livePhase(run: DevinRun): Promise<string | null> {
  const deps = bridgeDeps();
  if (isInFlight(run.status) && run.sessionId) {
    await pollRun(run, deps).catch(() => undefined);
  }
  const frames = readReplay(deps.repoRoot, run.id);
  const latest = frames[frames.length - 1];
  return latest ? `${latest.structured_output.phase} · ${latest.structured_output.phase_status}` : null;
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
  };
}

export default async function RunsPage() {
  const actor = await currentActor();
  if (!automationTool.visibleTo.includes(actor.role)) notFound();

  const rows = listRuns(PAGE_SIZE);
  const total = rows.length;
  const mode = bridgeMode(bridgeDeps());
  const phases = new Map<string, string | null>();
  for (const run of rows) phases.set(run.id, await livePhase(run));
  const anyInFlight = rows.some((run) => isInFlight(run.status) && run.sessionId);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {anyInFlight ? <AutoRefresh everyMs={5000} /> : null}
      <Panel
        title={
          <span className="flex items-center gap-2">
            Runs <ReplayBadge mode={mode} />
          </span>
        }
        bodyClassName="p-0"
        actions={
          <span className="text-[11px] text-muted-foreground">
            {total} run{total === 1 ? "" : "s"} · newest first
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
              const phase = phases.get(run.id) ?? null;
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
                        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          {phase}
                          <ReplayBadge mode={mode} />
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden font-mono text-[11px] lg:table-cell">
                    {run.prUrl ? (
                      <a href={run.prUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        #{run.prUrl.split("/").pop()}
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
