import { registerConstants } from "@console/engine/policy/register";
import type { ToolDeclaration } from "@console/engine/types";
import { ensureModeFlags } from "@/lib/mode-flags";
import { TOOLS } from "@/registry";

/** Seeds only tools whose queue is still empty, e.g. one a merge just registered. Returns the names it seeded. */
export function seedNewTools(tools: readonly ToolDeclaration[] = TOOLS): string[] {
  for (const tool of tools) {
    if (tool.constants?.length) registerConstants(tool.constants);
  }
  ensureModeFlags();
  const seeded: string[] = [];
  for (const tool of tools) {
    if (!tool.seed) continue;
    if (tool.list({ filters: {}, limit: 1, offset: 0 }).total > 0) continue;
    tool.seed();
    if (tool.list({ filters: {}, limit: 1, offset: 0 }).total > 0) seeded.push(tool.name);
  }
  return seeded;
}
