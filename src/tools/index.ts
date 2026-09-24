import type { ToolRegistry } from "@/engine/registry";
import type { Role, ToolDeclaration } from "@/engine/types";
import { flagTool } from "@/tools/flags";
import { kycTool } from "@/tools/kyc";
import { refundTool } from "@/tools/refunds";

/**
 * Explicit registry of governed tools. A tool is added by importing its
 * declaration and listing it here; nothing else in the app enumerates tools.
 */
export const TOOLS: ToolDeclaration[] = [kycTool, refundTool, flagTool];

export function getTool(name: string): ToolDeclaration | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** What the application hands to `configureEngine`. */
export const toolRegistry: ToolRegistry = { get: getTool };

export function toolsForRole(role: Role): ToolDeclaration[] {
  return TOOLS.filter((t) => t.visibleTo.includes(role));
}
