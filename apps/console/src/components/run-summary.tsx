import { Panel } from "@/components/panel";
import { CHECKLIST_GLYPH, type ChecklistLine } from "@/lib/run-checklist";
import { automationTool, type DevinRun, getSpec, RUN_KINDS } from "@console/tool-automation";
import { ROLES, roleLabel, type Role } from "@console/permissions";
import { StatusChip } from "@console/ui/status-chip";
import { cn } from "@console/ui/utils";

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
 * that, the checklist projected from the session's last structured output.
 */
export function RunSummary({
  run,
  checklist,
  phaseLine,
}: {
  run: DevinRun;
  checklist: ChecklistLine[];
  /** The session's `phase · phase_status`, when it has reported one. */
  phaseLine: string | null;
}) {
  const outcome = onceMerged(run);
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
          <StatusChip value={run.status} statuses={automationTool.statuses} />
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
        <ol className="mt-3 space-y-1 border-t border-border pt-2" data-testid="run-checklist">
          {checklist.map((line, i) => (
            <li key={`${line.field}:${i}`} className="flex items-baseline gap-2">
              <span
                aria-label={line.state}
                className={cn(
                  "w-3 shrink-0 text-center font-mono",
                  line.state === "done" && "text-emerald-400",
                  line.state === "running" && "text-amber-400",
                  line.state === "waiting" && "text-muted-foreground",
                  line.state === "failed" && "text-red-400",
                )}
              >
                {CHECKLIST_GLYPH[line.state]}
              </span>
              <span className={cn(line.state === "waiting" && "text-muted-foreground")}>{line.label}</span>
              {line.detail ? (
                <span className="min-w-0 truncate font-mono text-muted-foreground">{line.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 border-t border-border pt-2 text-muted-foreground">
          The session has not reported structured output yet.
        </p>
      )}
    </Panel>
  );
}
