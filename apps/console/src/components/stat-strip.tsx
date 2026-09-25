import Link from "next/link";
import type { Actor, ToolDeclaration } from "@console/engine/types";
import { cn } from "@console/ui/utils";
import { resolveStat, statsFor } from "@/lib/stats";

/**
 * Role-scoped counts above a tool queue. Every count is a live query and
 * links to exactly the rows it counts, so the number and the page agree.
 */
export function StatStrip({ decl, actor }: { decl: ToolDeclaration; actor: Actor }) {
  const stats = statsFor(decl, actor);
  if (stats.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card px-3 py-1.5 text-xs">
      {stats.map((stat) => {
        const { value, href } = resolveStat(decl, actor, stat);
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
