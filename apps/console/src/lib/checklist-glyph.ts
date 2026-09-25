/**
 * Checklist states and their glyphs. Kept free of imports so client
 * components can render a checklist without pulling in the run-file schemas.
 */
export type ChecklistState = "done" | "running" | "waiting" | "failed";

export const CHECKLIST_GLYPH: Record<ChecklistState, string> = {
  done: "✓",
  running: "●",
  waiting: "○",
  failed: "✗",
};
