import { registerConstants } from "@console/engine/policy/register";
import { TOOLS } from "@/registry";

/**
 * Registers every tool's declared constants so they exist in the live
 * database without a re-seed. Called on server start (instrumentation) and
 * in-process right after a merge sync runs `db:migrate` (MERGE_SYNC.md).
 */
export function registerToolConstants(): void {
  for (const tool of TOOLS) {
    if (tool.constants?.length) registerConstants(tool.constants);
  }
}
