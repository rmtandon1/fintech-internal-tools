import { OPS_MODES, type OpsMode } from "@/lib/modes";
import { getTool } from "@/registry";
import { enabledFlagKeys, ensureFlagRow } from "@console/tool-flags";

/** True when `toolId`'s mode names a feature flag that is currently off. */
export function modeFlagOff(toolId: string, modes: readonly OpsMode[] = OPS_MODES): boolean {
  const mode = modes.find((m) => m.id === toolId);
  return mode?.flag !== undefined && !enabledFlagKeys().has(mode.flag);
}

/**
 * Registers an off flag row for every flagged mode whose tool is registered,
 * so a merged Devin build is switchable from Feature flags on databases
 * seeded before the flag existed. Called on server start; seeds cover fresh
 * databases, this covers existing ones.
 */
export function ensureModeFlags(modes: readonly OpsMode[] = OPS_MODES): void {
  for (const mode of modes) {
    if (!mode.flag || getTool(mode.id) === undefined) continue;
    ensureFlagRow({ key: mode.flag, name: mode.name });
  }
}
