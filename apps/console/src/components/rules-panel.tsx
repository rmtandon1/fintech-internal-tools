import { listConstants } from "@console/engine/policy/constants";
import type { Actor, AdminActionDecl, ToolDeclaration } from "@console/engine/types";
import { listRuns } from "@console/tool-automation";
import { AdminActionButton } from "@/components/admin-action-button";
import { ConstantEditor } from "@/components/constant-editor";
import { Panel } from "@/components/panel";
import { PrButton } from "@/components/pr-button";
import { RemoveRuleButton } from "@/components/remove-rule-dialog";
import { RuleToggle } from "@/components/rule-toggle";
import { devinMode } from "@/lib/devin-status";
import { buildRuleRows, formatDay, type RuleRow } from "@/lib/rules-panel";

export const RULES_SUBTITLE =
  "What decides where these requests go. Changes apply straight away and are logged.";

/** The roles that change settings and switch rules; others see the same controls, greyed out. */
const EDITING_ROLES = ["manager", "admin"];

/**
 * What decides where a tool's requests go: the built-in limits, then the
 * rules Devin added, each with its switch, provenance and PR. Reads the
 * database rows and the runs; every change goes through `updateConstant`.
 */
export function RulesPanel({ decl, actor }: { decl: ToolDeclaration; actor: Actor }) {
  const rows = buildRuleRows(decl, listConstants(), listRuns({ limit: 200 }));
  const onCards = new Set(rows.flatMap((row) => row.actions));
  const looseActions = (decl.adminActions ?? []).filter((a) => !onCards.has(a));
  if (rows.length === 0 && looseActions.length === 0) return null;

  const canEdit = EDITING_ROLES.includes(actor.role);
  const canRemove = devinMode() === "live" && canEdit;
  const limits = rows.filter((row) => !row.devin);
  const added = rows.filter((row) => row.devin && row.devin.state.kind !== "removed");
  const removed = rows.filter((row) => row.devin?.state.kind === "removed");

  return (
    <Panel
      id="rules"
      title="Rules"
      className="max-h-[50vh] shrink-0"
      actions={looseActions.length > 0 ? <Actions tool={decl.name} actions={looseActions} /> : null}
    >
      <p className="px-4 pt-3 text-xs text-muted-foreground" data-testid="rules-subtitle">
        {RULES_SUBTITLE}
      </p>

      {limits.length > 0 ? (
        <section className="px-4 pt-4" data-testid="rules-limits">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limits</h3>
          <ul className="mt-1 divide-y divide-border">
            {limits.map((row) => (
              <li key={row.key} className="flex items-center gap-6 py-2.5" data-testid="rule-row" data-key={row.key}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" title={row.key}>
                    {row.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{row.description}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ConstantEditor
                    setting={row.key}
                    type={row.type}
                    unit={row.unit}
                    value={row.value}
                    canEdit={canEdit}
                    registered={row.constant !== null}
                  />
                  {row.actions.length > 0 ? <Actions tool={decl.name} actions={row.actions} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="px-4 pb-4 pt-4" data-testid="rules-devin">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Added by Devin</h3>
        {added.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="no-devin-rules">
            No rules from Devin yet. When a pattern below needs one, ask from there.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {added.map((row) => (
              <DevinRuleCard key={row.key} tool={decl.name} row={row} canEdit={canEdit} canRemove={canRemove} />
            ))}
          </ul>
        )}
      </section>

      {removed.length > 0 ? (
        <details className="border-t border-border" data-testid="recently-removed">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-muted-foreground">
            Recently removed ({removed.length})
          </summary>
          <ul className="space-y-1.5 px-4 pb-4 text-xs text-muted-foreground">
            {removed.map((row) => {
              const info = row.devin!;
              const state = info.state.kind === "removed" ? info.state : null;
              return (
                <li key={row.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-1" data-testid="removed-rule" data-key={row.key}>
                  <span className="font-medium text-foreground">{info.name}</span>
                  <span>· removed by Devin ·</span>
                  <PrButton number={state?.prNumber ?? null} url={state?.prUrl ?? null} />
                  {state ? <span>· {formatDay(state.removedAt)}</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}

function Actions({ tool, actions }: { tool: string; actions: AdminActionDecl[] }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {actions.map((action) => (
        <AdminActionButton key={action.action} tool={tool} action={action.action} label={action.label} />
      ))}
    </div>
  );
}

function DevinRuleCard({
  tool,
  row,
  canEdit,
  canRemove,
}: {
  tool: string;
  row: RuleRow;
  canEdit: boolean;
  canRemove: boolean;
}) {
  const info = row.devin!;
  const removing = info.state.kind === "removal_in_review" ? info.state : null;
  return (
    <li
      className="rounded-lg border border-border bg-background p-4 shadow-xs"
      data-testid="devin-rule"
      data-key={row.key}
      data-state={info.state.kind}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" title={row.key}>
            {info.name}
          </div>
          {row.description ? <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p> : null}
        </div>
        {row.type === "boolean" ? (
          <RuleToggle
            setting={row.key}
            name={info.name}
            on={row.on}
            canEdit={canEdit}
            disabled={removing !== null || row.constant === null}
            reason={
              removing
                ? "Devin is removing this rule"
                : row.constant === null
                  ? "Available once the server has picked up the merge"
                  : undefined
            }
          />
        ) : null}
      </div>

      {removing ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
          data-testid="removal-banner"
        >
          <span>Devin is removing this rule ·</span>
          <PrButton number={removing.prNumber} url={removing.prUrl} />
          <span>in review</span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span data-testid="rule-provenance">
          Added by Devin · asked by {info.askedBy} · {formatDay(info.askedAt)}
        </span>
        <PrButton number={info.prNumber} url={info.prUrl} />
        <span className="ml-auto flex items-center gap-2">
          {removing ? null : (
            <RemoveRuleButton
              runId={info.runId}
              rule={{
                name: info.name,
                prNumber: info.prNumber,
                prUrl: info.prUrl,
                askedAt: info.askedAt,
                on: row.type === "boolean" ? row.on : null,
              }}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!canRemove}
              title={canRemove ? undefined : "Managers and admins ask Devin to remove rules when Devin is connected"}
            />
          )}
        </span>
      </div>

      {row.actions.length > 0 ? (
        <div className="mt-3 border-t border-border pt-3">
          <Actions tool={tool} actions={row.actions} />
        </div>
      ) : null}
    </li>
  );
}
