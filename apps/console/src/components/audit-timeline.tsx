import { Icon } from "@console/ui/icon";
import { PolicyTraceList } from "@console/ui/policy-trace";
import type { AuditRow } from "@console/engine/audit/query";
import { maskValue } from "@console/engine/pii/mask";
import type { FieldDecl, PolicyDecision } from "@console/engine/types";
import { formatTimestamp } from "@console/ui/format";
import { cn } from "@console/ui/utils";
import { auditEventLabel } from "@/lib/audit-events";
import { getTool } from "@/registry";

const EVENT_ICONS: Record<string, { icon: string; className: string }> = {
  applied: { icon: "Check", className: "text-emerald-400" },
  denied: { icon: "Ban", className: "text-red-400" },
  approval_requested: { icon: "UserCheck", className: "text-amber-400" },
  approval_granted: { icon: "ShieldCheck", className: "text-emerald-400" },
  approval_rejected: { icon: "ShieldX", className: "text-red-400" },
  pii_revealed: { icon: "Eye", className: "text-sky-400" },
  constant_changed: { icon: "SlidersHorizontal", className: "text-sky-400" },
};

export function AuditTimeline({
  events,
  compact,
}: {
  events: AuditRow[];
  compact?: boolean;
}) {
  if (events.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">Nothing recorded yet.</p>;
  }

  if (compact) {
    return (
      <ol>
        {events.map((event) => {
          const tone = EVENT_ICONS[event.event] ?? {
            icon: "Dot",
            className: "text-muted-foreground",
          };
          const decision = safeDecision(event.decisionJson);
          return (
            <li key={event.id}>
              <details>
                <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-3">
                  <Icon name={tone.icon} className={cn("size-3.5 shrink-0", tone.className)} />
                  <span className="min-w-0 flex-1 truncate text-sm">{event.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {event.actorId}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatTimestamp(event.ts)}
                  </span>
                </summary>
                <div className="space-y-2 border-t border-border/50 px-3 pb-2 pt-2">
                  {decision && decision.trace.length > 0 ? (
                    <div className="rounded-md border border-border">
                      <PolicyTraceList
                        trace={decision.trace}
                        labels={getTool(event.tool)?.ruleLabels}
                      />
                    </div>
                  ) : null}
                  <ChangedFields
                    before={event.beforeJson}
                    after={event.afterJson}
                    fields={getTool(event.tool)?.fields ?? []}
                  />
                  <TechnicalDetails event={event} />
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => {
        const tone = EVENT_ICONS[event.event] ?? {
          icon: "Dot",
          className: "text-muted-foreground",
        };
        const decision = safeDecision(event.decisionJson);
        return (
          <li key={event.id} className="flex gap-3">
            <div className={cn("mt-0.5", tone.className)}>
              <Icon name={tone.icon} className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm">{event.summary}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {auditEventLabel(event.event)} · {event.actorId} · {formatTimestamp(event.ts)}
              </div>
              {decision && decision.trace.length > 0 ? (
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Checks ({decision.trace.length})
                  </summary>
                  <div className="mt-1 rounded-md border border-border">
                    <PolicyTraceList
                      trace={decision.trace}
                      labels={getTool(event.tool)?.ruleLabels}
                    />
                  </div>
                </details>
              ) : null}
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  What changed
                </summary>
                <div className="mt-1 space-y-2 rounded-md border border-border p-2">
                  <ChangedFields
                    before={event.beforeJson}
                    after={event.afterJson}
                    fields={getTool(event.tool)?.fields ?? []}
                  />
                  <TechnicalDetails event={event} />
                </div>
              </details>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Entry number and hashes: what proves the log was not edited, for whoever checks it. */
function TechnicalDetails({ event }: { event: AuditRow }) {
  return (
    <details>
      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
        Technical details
      </summary>
      <dl className="mt-1 space-y-0.5 font-mono text-[10px] text-muted-foreground">
        <Hash label="entry" value={String(event.seq)} />
        <Hash label="event" value={event.event} />
        <Hash label="prev" value={event.prevHash} />
        <Hash label="hash" value={event.rowHash} />
      </dl>
    </details>
  );
}

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-10 shrink-0 text-muted-foreground/70">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}

/**
 * Only the fields the write actually moved, so the diff stays readable. PII is
 * masked unconditionally: the audit stream is not a reveal surface, and a
 * reveal has to go through the audited action on the record.
 */
function ChangedFields({
  before,
  after,
  fields,
}: {
  before: string | null;
  after: string | null;
  fields: FieldDecl[];
}) {
  const from = safeRecord(before);
  const to = safeRecord(after);
  if (!to) return <p className="text-xs text-muted-foreground">Nothing on the record changed.</p>;

  const changed = Object.keys(to).filter(
    (key) => key !== "version" && JSON.stringify(from?.[key]) !== JSON.stringify(to[key]),
  );
  if (changed.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing on the record changed.</p>;
  }

  return (
    <table className="w-full text-xs">
      <tbody>
        {changed.map((key) => {
          const field = fields.find((f) => f.name === key);
          const pii = field?.isPII ? field : undefined;
          const show = (value: unknown) =>
            pii ? maskValue(value, pii.revealTail ?? 4) : display(value);
          return (
            <tr key={key}>
              <td className="py-0.5 pr-3 align-top text-muted-foreground">{field?.label ?? key}</td>
              <td className="py-0.5 pr-2 align-top text-muted-foreground/70 line-through">
                {show(from?.[key])}
              </td>
              <td className="py-0.5 align-top">{show(to[key])}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function safeRecord(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeDecision(json: string): PolicyDecision | null {
  try {
    return JSON.parse(json) as PolicyDecision;
  } catch {
    return null;
  }
}
