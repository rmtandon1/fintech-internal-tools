import { Panel } from "@/components/panel";
import { RunReport } from "@/components/run-report";
import type { StructuredOutput } from "@console/tool-automation/run-files";
import { automationTool, type DevinRun, getSpec, RUN_KINDS, runKindLabel } from "@console/tool-automation";
import { ROLES, roleLabel, type Role } from "@console/permissions";
import { StatusChip } from "@console/ui/status-chip";

const ROLE_NAMES: readonly string[] = ROLES;

function isRole(value: string): value is Role {
  return ROLE_NAMES.includes(value);
}

/** The requester as the operator knows them: role label and actor id. */
export function requesterLabel(run: DevinRun): string {
  const role = isRole(run.requestedByRole) ? roleLabel(run.requestedByRole) : run.requestedByRole;
  return `${role} · ${run.requestedBy}`;
}

/** The spec's one-line consequence of merging this kind of run. */
export function onceMerged(run: DevinRun): string | null {
  const kind = RUN_KINDS.find((k) => k === run.kind);
  return kind ? (getSpec(run.spec)?.outcomes[kind] ?? null) : null;
}

/**
 * What an operator needs before touching a run: what was asked, by whom,
 * what kind of change it is, where it stands and what merging it does. Under
 * that, the full report from the session's last structured output.
 */
export function RunSummary({
  run,
  output,
  phaseLine,
}: {
  run: DevinRun;
  output: StructuredOutput | null;
  /** Where the session says it is, when it has reported. */
  phaseLine: string | null;
}) {
  const outcome = onceMerged(run);
  return (
    <Panel title="Summary" className="mx-5 mb-5" bodyClassName="space-y-6 p-5 text-sm">
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div className="text-xs font-medium text-muted-foreground">{runKindLabel(run.kind)}</div>
          <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {run.intent}
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Fact label="Asked by">{requesterLabel(run)}</Fact>
          <Fact label="Status">
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip value={run.status} statuses={automationTool.statuses} />
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
