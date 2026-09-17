import { Icon } from "@/components/icon";
import { PolicyTraceList } from "@/components/policy-trace";
import type { AuditRow } from "@/engine/audit/query";
import type { PolicyDecision } from "@/engine/types";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Record<string, { icon: string; className: string }> = {
  applied: { icon: "Check", className: "text-emerald-400" },
  denied: { icon: "Ban", className: "text-red-400" },
  approval_requested: { icon: "UserCheck", className: "text-amber-400" },
  approval_granted: { icon: "ShieldCheck", className: "text-emerald-400" },
  approval_rejected: { icon: "ShieldX", className: "text-red-400" },
  pii_revealed: { icon: "Eye", className: "text-sky-400" },
  constant_changed: { icon: "SlidersHorizontal", className: "text-sky-400" },
};

export function AuditTimeline({ events }: { events: AuditRow[] }) {
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">No events yet.</p>;
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
                <span className="text-[11px] text-muted-foreground">
                  {event.actorId} · {formatTimestamp(event.ts)}
                </span>
              </div>
              {decision && decision.trace.length > 0 ? (
                <details className="group">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                    Policy trace ({decision.trace.length})
                  </summary>
                  <div className="mt-1 rounded-md border border-border p-2">
                    <PolicyTraceList trace={decision.trace} />
                  </div>
                </details>
              ) : null}
              <div className="font-mono text-[10px] text-muted-foreground/70">
                #{event.seq} · {event.rowHash.slice(0, 16)}…
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function safeDecision(json: string): PolicyDecision | null {
  try {
    return JSON.parse(json) as PolicyDecision;
  } catch {
    return null;
  }
}
