import { countPendingFor, countRequestedBy } from "@console/engine/approvals";
import { listAuditEvents } from "@console/engine/audit/query";
import type { Actor, StatDecl, ToolDeclaration } from "@console/engine/types";

const HOUR = 60 * 60 * 1000;

/** The tool's stats this role is meant to see, in declaration order. */
export function statsFor(decl: ToolDeclaration, actor: Actor): StatDecl[] {
  return (decl.stats ?? []).filter((stat) => stat.roles.includes(actor.role));
}

/** A stat's live count and the page listing exactly the rows it counts. */
export function resolveStat(
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
