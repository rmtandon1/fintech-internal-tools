import Link from "next/link";
import { countPendingFor, countRequestedBy } from "@console/engine/approvals";
import { listAuditEvents } from "@console/engine/audit/query";
import type { Actor, StatDecl, ToolDeclaration } from "@console/engine/types";
import { cn } from "@console/ui/utils";

const HOUR = 60 * 60 * 1000;

/**
 * Role-scoped counts above a tool queue. Every count is a live query and
 * links to exactly the rows it counts, so the number and the page agree.
 */
export function StatStrip({ decl, actor }: { decl: ToolDeclaration; actor: Actor }) {
  const stats = (decl.stats ?? []).filter((stat) => stat.roles.includes(actor.role));
  if (stats.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card px-3 py-1.5 text-xs">
      {stats.map((stat) => {
        const { value, href } = resolve(decl, actor, stat);
        const alert = stat.tone === "warning" && value > 0;
        return (
          <Link
            key={stat.key}
            href={href}
            className={cn(
              "inline-flex items-baseline gap-1.5 text-muted-foreground hover:text-foreground",
              alert && "text-amber-400 hover:text-amber-300",
            )}
          >
            <span
              className={cn(
                "text-base font-semibold tabular-nums",
                alert ? "text-amber-400" : "text-foreground",
              )}
            >
              {value}
            </span>
            <span>{stat.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function resolve(
  decl: ToolDeclaration,
  actor: Actor,
  stat: StatDecl,
): { value: number; href: string } {
  const { source } = stat;
  switch (source.kind) {
    case "records": {
      const { total } = decl.list({ filters: source.filters, limit: 0, offset: 0 });
      return { value: total, href: `/t/${decl.name}?${new URLSearchParams(source.filters)}` };
    }
    case "approvals": {
      const value =
        source.scope === "decidable"
          ? countPendingFor(actor, decl.name)
          : countRequestedBy(actor, decl.name);
      return { value, href: `/inbox?tool=${decl.name}` };
    }
    case "audit": {
      const { total } = listAuditEvents({
        tool: decl.name,
        event: source.event,
        since: Date.now() - source.sinceHours * HOUR,
        limit: 0,
      });
      return {
        value: total,
        href: `/audit?tool=${decl.name}&event=${source.event}&since=${source.sinceHours}`,
      };
    }
  }
}
