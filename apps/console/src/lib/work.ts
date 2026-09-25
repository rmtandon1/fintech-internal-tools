import type { GovernedRecord, ToolDeclaration } from "@console/engine/types";

export interface WorkSummary {
  open: number;
  attention: number;
  attentionLabel: string | null;
  /** Records that count as open work or need attention. */
  work: GovernedRecord[];
  rows: GovernedRecord[];
}

/**
 * Home Work panel counts, computed in JS over the tool's default ordering.
 * Demo volumes are small enough that one unfiltered list is fine.
 */
export function workSummary(
  decl: ToolDeclaration,
  now: number,
): WorkSummary {
  const { rows } = decl.list({ filters: {}, limit: 500, offset: 0 });
  let open = 0;
  let attention = 0;
  let attentionLabel: string | null = null;
  const work: GovernedRecord[] = [];
  for (const row of rows) {
    const isOpen =
      decl.openStatuses === undefined ||
      decl.openStatuses.includes(String(row[decl.statusField]));
    const marker = decl.attention?.(row, now) ?? null;
    if (isOpen) open += 1;
    if (marker) {
      attention += 1;
      attentionLabel = marker;
    }
    if (isOpen || marker) work.push(row);
  }
  return { open, attention, attentionLabel, work, rows };
}
