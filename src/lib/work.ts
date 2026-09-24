import type { Actor, GovernedRecord, ToolDeclaration } from "@/engine/types";

export interface WorkSummary {
  open: number;
  attention: number;
  attentionLabel: string | null;
  rows: GovernedRecord[];
}

/**
 * Home Work panel counts, computed in JS over the tool's default ordering.
 * Demo volumes are small enough that one unfiltered list is fine.
 */
export function workSummary(
  decl: ToolDeclaration,
  actor: Actor,
  now: number,
): WorkSummary {
  void actor;
  const { rows } = decl.list({ filters: {}, limit: 500, offset: 0 });
  let open = 0;
  let attention = 0;
  let attentionLabel: string | null = null;
  for (const row of rows) {
    if (decl.openStatuses?.includes(String(row[decl.statusField]))) open += 1;
    const marker = decl.attention?.(row, now) ?? null;
    if (marker) {
      attention += 1;
      attentionLabel = marker;
    }
  }
  return { open, attention, attentionLabel, rows };
}
