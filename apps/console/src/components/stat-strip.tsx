import type { Actor, StatDecl, ToolDeclaration } from "@console/engine/types";
import { StatCard } from "@console/ui/stat-card";
import { resolveStat, statsFor } from "@/lib/stats";

const ICONS: Record<StatDecl["source"]["kind"], string> = {
  records: "Layers",
  approvals: "UserCheck",
  audit: "ScrollText",
};

/**
 * Role-scoped counts above a tool queue, as a row of stat cards. Every count
 * is a live query and links to exactly the rows it counts, so the number and
 * the page agree. A warning stat only turns amber, with an icon, above zero.
 */
export function StatStrip({ decl, actor }: { decl: ToolDeclaration; actor: Actor }) {
  const stats = statsFor(decl, actor);
  if (stats.length === 0) return null;

  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      {stats.map((stat) => {
        const { value, href } = resolveStat(decl, actor, stat);
        const alert = stat.tone === "warning" && value > 0;
        return (
          <StatCard
            key={stat.key}
            label={stat.label}
            value={value.toLocaleString("en-US")}
            icon={alert ? "TriangleAlert" : ICONS[stat.source.kind]}
            tone={alert ? "warning" : "neutral"}
            href={href}
          />
        );
      })}
    </div>
  );
}
