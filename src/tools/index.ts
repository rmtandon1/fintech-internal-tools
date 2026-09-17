import type { Role, ToolDeclaration } from "@/engine/types";
import { kycTool } from "@/tools/kyc";
import { refundTool } from "@/tools/refunds";

/**
 * Explicit registry of governed tools. A tool is added by importing its
 * declaration and listing it here; nothing else in the app enumerates tools.
 */
export const TOOLS: ToolDeclaration[] = [kycTool, refundTool];

/**
 * Adds a declaration to the registry at runtime. Production tools are listed
 * in `TOOLS` above; this exists so tests can register a fixture tool without
 * the engine ever knowing a concrete tool name.
 */
export function registerTool(decl: ToolDeclaration): void {
  const index = TOOLS.findIndex((t) => t.name === decl.name);
  if (index >= 0) TOOLS.splice(index, 1, decl);
  else TOOLS.push(decl);
}

export function getTool(name: string): ToolDeclaration | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toolsForRole(role: Role): ToolDeclaration[] {
  return TOOLS.filter((t) => t.visibleTo.includes(role));
}
