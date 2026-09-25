import { expect } from "vitest";
import type { ToolDeclaration } from "@console/engine/types";

/**
 * Rule 2 of the strip: a records stat's count is `list` with its filters, so
 * the number and the rows it links to cannot disagree. Every filter a stat
 * uses must also be a declared filter, or the link would drop it.
 */
export function expectRecordStatsMatchList(decl: ToolDeclaration): void {
  const declared = new Set(decl.filters.map((f) => f.field));
  const stats = (decl.stats ?? []).filter((s) => s.source.kind === "records");
  expect(stats.length).toBeGreaterThan(0);
  for (const stat of stats) {
    if (stat.source.kind !== "records") continue;
    for (const [field, value] of Object.entries(stat.source.filters)) {
      expect(declared.has(field), `${stat.key} filters on undeclared ${field}`).toBe(true);
      const options = decl.filters.find((f) => f.field === field)?.options;
      if (options) {
        expect(
          options.some((o) => o.value === value),
          `${stat.key}: ${field}=${value} is not a filter option`,
        ).toBe(true);
      }
    }
    const counted = decl.list({ filters: stat.source.filters, limit: 0, offset: 0 }).total;
    const listed = decl.list({ filters: stat.source.filters, limit: 1000, offset: 0 });
    expect(counted, stat.key).toBe(listed.total);
    expect(listed.rows.length, stat.key).toBe(listed.total);
  }
}
