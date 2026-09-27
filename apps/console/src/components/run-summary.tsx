import { Panel } from "@/components/panel";
import { ChecklistList } from "@/components/checklist-list";
import type { ChecklistLine } from "@/lib/run-checklist";
import type { DevinRun } from "@console/tool-automation";
import { ROLES, roleLabel, type Role } from "@console/permissions";
import { StatusChip } from "@console/ui/status-chip";

/** The fields the summary reads; the route's public run satisfies this. */
export type RunSummaryRun = Pick<
  DevinRun,
  "intent" | "kind" | "status" | "reverses" | "requestedBy" | "requestedByRole"
>;

const ROLE_NAMES: readonly string[] = ROLES;

function isRole(value: string): value is Role {
  return ROLE_NAMES.includes(value);
}

/** The requester as the operator knows them: role label and actor id. */
export function requesterLabel(run: Pick<RunSummaryRun, "requestedBy" | "requestedByRole">): string {
  const role = isRole(run.requestedByRole) ? roleLabel(run.requestedByRole) : run.requestedByRole;
  return `${role} · ${run.requestedBy}`;
}

/** The status options `StatusChip` needs, kept client-safe (no tool index). */
export const RUN_STATUS_OPTIONS = [
  { value: "dispatched", label: "Dispatched", tone: "info" as const },
  { value: "dispatch_failed", label: "Dispatch failed", tone: "negative" as const },
  { value: "running", label: "Running", tone: "info" as const },
  { value: "approved", label: "Approved", tone: "positive" as const },
  { value: "merged", label: "Merged", tone: "positive" as const },
  { value: "stopped", label: "Stopped", tone: "neutral" as const },
];

/**
 * What an operator needs before touching a run: what was asked, by whom,
 * what kind of change it is, where it stands and what merging it does. Under
 * that, the checklist projected from the session's last structured output.
 * Presentational only: the spec's once-merged line arrives as a prop because
 * resolving it needs the registered spec, a server-side lookup.
 */
export function RunSummary({
  run,
  checklist,
  phaseLine,
  outcome,
}: {
  run: RunSummaryRun;
  checklist: ChecklistLine[];
  /** The session's `phase · phase_status`, when it has reported one. */
  phaseLine: string | null;
  /** The spec's one-line consequence of merging this run, when it names one. */
  outcome: string | null;
}) {
  return (
    <Panel
      title="Run summary"
      className="mx-3 mb-3"
      bodyClassName="p-3 text-xs"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Intent</dt>
        <dd className="whitespace-pre-wrap break-words">{run.intent}</dd>
        <dt className="text-muted-foreground">Requester</dt>
        <dd>{requesterLabel(run)}</dd>
        <dt className="text-muted-foreground">Kind</dt>
        <dd className="font-mono">{run.kind}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <StatusChip value={run.status} statuses={RUN_STATUS_OPTIONS} />
          {phaseLine ? <span className="font-mono text-muted-foreground">{phaseLine}</span> : null}
        </dd>
        {outcome ? (
          <>
            <dt className="text-muted-foreground">Once merged</dt>
            <dd className="break-words">{outcome}</dd>
          </>
        ) : null}
        {run.reverses ? (
          <>
            <dt className="text-muted-foreground">Reverses</dt>
            <dd>
              <a href={`/t/automation/${run.reverses}`} className="font-mono hover:underline">
                {run.reverses}
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {checklist.length > 0 ? (
        <ChecklistList lines={checklist} className="mt-3 border-t border-border pt-2" />
      ) : (
        <p className="mt-3 border-t border-border pt-2 text-muted-foreground">
          The session has not reported structured output yet.
        </p>
      )}
    </Panel>
  );
}
