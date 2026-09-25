import { ActionBar } from "@/components/action-panel";
import { AuditTimeline } from "@/components/audit-timeline";
import { Panel } from "@/components/panel";
import { PolicyTraceList } from "@/components/policy-trace";
import { RevealField } from "@/components/reveal-field";
import { auditTrailFor } from "@/engine/audit/query";
import { maskRecord } from "@/engine/pii/mask";
import { previewActions } from "@/engine/policy/preview";
import type { Actor, FieldDecl, GovernedRecord, ToolDeclaration } from "@/engine/types";
import { formatFieldValue } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The whole record surface — fields, policy trace, linked activity and the
 * action bar — shared verbatim by the home page and /t/[tool]/[id].
 */
export function RecordView({
  decl,
  record,
  actor,
}: {
  decl: ToolDeclaration;
  record: GovernedRecord;
  actor: Actor;
}) {
  const masked = maskRecord(decl, record, actor);
  const previews = previewActions(decl, record, actor);
  const trail = auditTrailFor(decl.recordType, record.id);

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

        <Panel
          title={
            traced ? (
              <span className="flex items-center gap-2">
                Policy trace{" "}
                <span className="font-mono normal-case tracking-normal text-foreground">
                  · {traced.label}
                </span>
              </span>
            ) : (
              "Policy trace"
            )
          }
          className="mx-3 mb-3"
          bodyClassName="py-0.5"
        >
          {traced?.decision ? (
            <PolicyTraceList trace={traced.decision.trace} />
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Policy runs once required input is supplied.
            </p>
          )}
        </Panel>
      </div>

      <details
        open={trail.length <= 3}
        className="shrink-0 border-t border-border"
      >
        <summary className="flex h-8 cursor-pointer items-center gap-2 border-b border-border px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Activity · <span className="tabular-nums">{trail.length}</span>
        </summary>
        <div className="max-h-40 overflow-auto py-0.5">
          <AuditTimeline events={trail} compact />
        </div>
      </details>

      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
        <ActionBar tool={decl.name} recordId={record.id} previews={previews} />
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
