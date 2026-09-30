import type { StatusDecl, Actor, ToolDeclaration } from "@console/engine/types";
import { listConstants } from "@console/engine/policy/constants";
import { getSpec, listRuns, operationsStartableBy } from "@console/tool-automation";
import { GitHubMark } from "@console/ui/github-mark";
import { StatusChip } from "@console/ui/status-chip";
import { cn } from "@console/ui/utils";
import { AdminActionButton } from "@/components/admin-action-button";
import { ConstantEditor } from "@/components/constant-editor";
import { Panel } from "@/components/panel";
import { RemoveRuleButton } from "@/components/remove-rule-dialog";
import { devinMode } from "@/lib/devin-status";
import { buildRuleRows, type RuleRow } from "@/lib/rules-panel";

const ON_OFF: StatusDecl[] = [
  { value: "on", label: "On", tone: "positive" },
  { value: "off", label: "Off", tone: "neutral" },
];

const STATES: StatusDecl[] = [
  { value: "live", label: "Live", tone: "positive" },
  { value: "removal_in_review", label: "Removal in review", tone: "warning" },
  { value: "removed", label: "Removed", tone: "neutral" },
];

function formatValue(value: RuleRow["value"]): string {
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function DevinLine({ rule }: { rule: NonNullable<RuleRow["devin"]> }) {
  return (
    <span className="text-xs text-muted-foreground" data-testid="rule-provenance">
      Added by Devin ·{" "}
      {rule.prUrl ? (
        <a href={rule.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:underline">
          <GitHubMark className="size-3" />
          PR #{rule.prNumber ?? "?"}
        </a>
      ) : (
        <span className="font-mono">PR #{rule.prNumber ?? "?"}</span>
      )}{" "}
      · asked by {rule.askedBy}
    </span>
  );
}

function StateChip({ rule }: { rule: NonNullable<RuleRow["devin"]> }) {
  const { state } = rule;
  if (state.kind === "removed") {
    return (
      <span className="inline-flex items-center gap-1">
        <StatusChip value="removed" statuses={STATES} />
        {state.prUrl ? (
          <a href={state.prUrl} target="_blank" rel="noreferrer" className="font-mono text-[11px] hover:underline">
            · PR #{state.prNumber ?? "?"}
          </a>
        ) : (
          <span className="font-mono text-[11px]">· PR #{state.prNumber ?? "?"}</span>
        )}
      </span>
    );
  }
  return <StatusChip value={state.kind} statuses={STATES} />;
}

/**
 * The tool's rules, on its own page: every setting its current code declares
 * with the live value, the rules Devin added (and where each stands), and the
 * tool-wide actions an admin may run. Admins edit in place; others read.
 */
export function RulesPanel({ decl, actor }: { decl: ToolDeclaration; actor: Actor }) {
  const rows = buildRuleRows(decl, listConstants(), listRuns({ limit: 200 }));
  const admin = actor.role === "admin";
  const adminActions = admin ? (decl.adminActions ?? []) : [];
  if (rows.length === 0 && adminActions.length === 0) return null;
  const connected = devinMode() === "live";

  return (
    <Panel
      id="rules"
      title="Rules"
      className="max-h-[45vh] shrink-0"
      actions={
        adminActions.length > 0 ? (
          <>
            {adminActions.map((a) => (
              <AdminActionButton key={a.action} tool={decl.name} action={a.action} label={a.label} />
            ))}
          </>
        ) : undefined
      }
    >
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const removed = row.devin?.state.kind === "removed";
          const editable = admin && row.constant !== null && row.declared && !removed;
          const spec = row.devin ? getSpec(row.devin.spec) : undefined;
          const removable =
            admin &&
            row.devin?.state.kind === "live" &&
            spec !== undefined &&
            operationsStartableBy(actor.role, spec).includes("undo");
          return (
            <li
              key={row.key}
              className={cn("flex flex-col gap-2 px-4 py-3", removed && "text-muted-foreground")}
              data-testid="rule-row"
              data-key={row.key}
              data-state={row.devin?.state.kind ?? "declared"}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cn("text-sm font-medium", removed && "line-through")}>
                  {row.devin?.name ?? row.key}
                </span>
                {row.devin ? (
                  <code className="font-mono text-[11px] text-muted-foreground">{row.key}</code>
                ) : null}
                {row.devin ? <DevinLine rule={row.devin} /> : null}
                <span className="ml-auto flex items-center gap-2">
                  {row.devin && !removed ? <StatusChip value={row.on ? "on" : "off"} statuses={ON_OFF} /> : null}
                  {row.devin ? <StateChip rule={row.devin} /> : null}
                  {removable && row.devin ? (
                    <RemoveRuleButton
                      runId={row.devin.runId}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!connected}
                      title={connected ? undefined : "Set DEVIN_API_KEY to connect Devin"}
                    >
                      Remove…
                    </RemoveRuleButton>
                  ) : null}
                </span>
              </div>
              {editable && row.constant ? (
                <ConstantEditor constant={row.constant} />
              ) : (
                <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  {row.description ? <span className={cn(removed && "line-through")}>{row.description}</span> : null}
                  <span className="font-mono text-xs" data-testid="rule-value">
                    {formatValue(row.value)}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
