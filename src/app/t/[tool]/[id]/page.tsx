import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPanel } from "@/components/action-panel";
import { AuditTimeline } from "@/components/audit-timeline";
import { Icon } from "@/components/icon";
import { RevealField } from "@/components/reveal-field";
import { StatusChip } from "@/components/status-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auditTrailFor } from "@/engine/audit/query";
import { maskRecord } from "@/engine/pii/mask";
import { previewActions } from "@/engine/policy/preview";
import { formatFieldValue } from "@/lib/format";
import { currentActor } from "@/lib/session";
import { getTool } from "@/tools";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ tool: string; id: string }>;
}) {
  const { tool, id } = await params;
  const decl = getTool(tool);
  const actor = await currentActor();
  if (!decl || !decl.visibleTo.includes(actor.role)) notFound();

  const record = decl.get(id);
  if (!record) notFound();

  const masked = maskRecord(decl, record, actor);
  const previews = previewActions(decl, record, actor);
  const trail = auditTrailFor(decl.recordType, id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/t/${decl.name}`} className="hover:text-foreground">
          {decl.displayName}
        </Link>
        <Icon name="ChevronRight" className="size-3.5" />
        <span className="font-mono text-xs">{record.id}</span>
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">
          {String(masked.values[decl.titleField] ?? record.id)}
        </h1>
        <StatusChip value={String(record[decl.statusField])} statuses={decl.statuses} />
        <span className="text-xs text-muted-foreground">version {record.version}</span>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {decl.sections.map((section) => (
            <Card key={section.title}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {section.fields.map((name) => {
                  const field = decl.fields.find((f) => f.name === name);
                  if (!field) return null;
                  return (
                    <div key={name} className="space-y-0.5">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
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
                        <div className="text-sm">{formatFieldValue(field, masked.values)}</div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">History</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTimeline events={trail} />
            </CardContent>
          </Card>
        </div>

        <ActionPanel tool={decl.name} recordId={record.id} previews={previews} />
      </div>
    </div>
  );
}
