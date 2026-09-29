import type { Actor, ToolDeclaration } from "@console/engine/types";

export function resolveQueueFilters(
  decl: Pick<ToolDeclaration, "filters" | "defaultFilters">,
  actor: Actor,
  query: Record<string, string | string[] | undefined>,
) {
  const filters: Record<string, string> = {};
  const filterQuery: Record<string, string> = {};
  const defaults = decl.defaultFilters?.(actor) ?? {};

  for (const filter of decl.filters) {
    const value = query[filter.field];
    if (typeof value === "string" && value !== "") {
      if (value !== "all") filters[filter.field] = value;
      filterQuery[filter.field] = value;
    } else if (defaults[filter.field]) {
      filters[filter.field] = defaults[filter.field];
      filterQuery[filter.field] = defaults[filter.field];
    }
  }

  return { filters, filterQuery };
}
