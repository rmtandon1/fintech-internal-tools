import { Panel } from "@/components/panel";
import { RunReport } from "@/components/run-report";
import type { StructuredOutput } from "@console/tool-automation/run-files";
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
 * that, the full report from the session's last structured output.
 * Presentational only: the spec's once-merged line and the kind's label
 * arrive as props because resolving them needs the registered spec, a
 * server-side lookup.
 */
export function RunSummary({
  run,
  output,
  phaseLine,
  outcome,
  kindLabel,
}: {
  run: RunSummaryRun;
  output: StructuredOutput | null;
  /** Where the session says it is, when it has reported. */
  phaseLine: string | null;
  /** The spec's one-line consequence of merging this run, when it names one. */
  outcome: string | null;
  /** The operator-facing name of the run's kind. */
  kindLabel: string;
}) {
  return (
    <Panel title="Summary" className="mx-5 mb-5" bodyClassName="space-y-6 p-5 text-sm">
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div className="text-xs font-medium text-muted-foreground">{kindLabel}</div>
          <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {run.intent}
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Fact label="Asked by">{requesterLabel(run)}</Fact>
          <Fact label="Status">
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip value={run.status} statuses={RUN_STATUS_OPTIONS} />
              {phaseLine ? <span className="text-muted-foreground">{phaseLine}</span> : null}
            </span>
          </Fact>
          {outcome ? <Fact label="Once live">{outcome}</Fact> : null}
          {run.reverses ? (
            <Fact label="Undoes">
              <a href={`/t/automation/${run.reverses}`} className="font-mono hover:underline">
                {run.reverses}
              </a>
            </Fact>
          ) : null}
        </dl>
      </div>
      {output ? (
        <RunReport output={output} />
      ) : (
        <p className="text-muted-foreground">Devin hasn&apos;t reported progress yet.</p>
      )}
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
