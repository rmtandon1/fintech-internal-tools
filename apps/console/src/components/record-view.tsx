import { ActionBar } from "@/components/action-panel";
import { AuditTimeline } from "@/components/audit-timeline";
import { Panel } from "@/components/panel";
import { PolicyTraceList } from "@console/ui/policy-trace";
import { RevealField } from "@/components/reveal-field";
import { auditTrailFor } from "@console/engine/audit/query";
import { maskRecord } from "@console/engine/pii/mask";
import { previewActions } from "@console/engine/policy/preview";
import type { Actor, FieldDecl, GovernedRecord, ToolDeclaration } from "@console/engine/types";
import { formatFieldValue } from "@console/ui/format";
import { cn } from "@console/ui/utils";

/**
 * The whole record surface — fields, policy trace, linked activity and the
 * action bar — shared verbatim by the home page and /t/[tool]/[id].
 */
export function RecordView({
  decl,
  record,
  actor,
  actions,
  extra,
}: {
  decl: ToolDeclaration;
  record: GovernedRecord;
  actor: Actor;
  /** Replaces the generic action bar for tools whose inputs the server derives. */
  actions?: React.ReactNode;
  /** Extra panels rendered under the policy trace. */
  extra?: React.ReactNode;
}) {
  const masked = maskRecord(decl, record, actor);
  const previews = previewActions(decl, record, actor);
  const trail = auditTrailFor(decl.recordType, record.id);

  // The checks for the first action this person can take, so they can see
  // what would happen before they click.
  const traced = previews.find((p) => p.offered && p.decision);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 xl:grid-cols-3">
          {decl.sections.map((section) => (
            <div key={section.title} className="contents">
              <div className="col-span-full mt-2 border-b border-border pb-1 text-[10px] uppercase tracking-wider text-muted-foreground first:mt-0">
                {section.title}
              </div>
              {section.fields.map((name) => {
                const field = decl.fields.find((f) => f.name === name);
                if (!field) return null;
                const numeric =
                  field.type === "number" || field.type === "currency";
                return (
                  <div key={name} className="min-w-0 space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">
                      {field.label}
                    </div>
                    {field.isPII ? (
                      <RevealField
                        tool={decl.name}
                        recordId={record.id}
                        field={field.name}
                        masked={String(masked.values[name] ?? "—")}
                        canReveal={masked.canReveal}
                      />
                    ) : (
                      <FieldValue field={field} masked={masked.values} numeric={numeric} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {traced?.decision ? (
          <Panel
            title={
              <span className="normal-case tracking-normal">
                If you {traced.label.toLowerCase()} now
              </span>
            }
            className="mx-3 mb-3"
            bodyClassName="py-0.5"
          >
            <PolicyTraceList trace={traced.decision.trace} labels={decl.ruleLabels} />
          </Panel>
        ) : null}
        {extra}
      </div>

      <details
        open={trail.length <= 3}
        className="shrink-0 border-t border-border"
      >
        <summary className="flex h-8 cursor-pointer items-center gap-2 border-b border-border px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          History · <span className="tabular-nums">{trail.length}</span>
        </summary>
        <div className="max-h-40 overflow-auto py-0.5">
          <AuditTimeline events={trail} compact />
        </div>
      </details>

      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-border px-3 py-3">
        {actions ?? (
          <ActionBar
            key={`${decl.name}:${record.id}`}
            tool={decl.name}
            recordId={record.id}
            recordLabel={String(record[decl.titleField] ?? record.id)}
            previews={previews}
            statuses={decl.statuses}
            ruleLabels={decl.ruleLabels}
          />
        )}
      </div>
    </div>
  );
}

function FieldValue({
  field,
  masked,
  numeric,
}: {
  field: FieldDecl;
  masked: Record<string, unknown>;
  numeric: boolean;
}) {
  const value = formatFieldValue(field, masked);
  const multiline = field.type === "text";
  return (
    <div
      className={cn(
        "text-xs",
        multiline ? "whitespace-pre-wrap break-words" : "truncate",
        numeric && "tabular-nums",
      )}
      title={value !== "—" ? value : field.help}
    >
      {value}
    </div>
  );
}
