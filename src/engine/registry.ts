import type { ToolDeclaration } from "@/engine/types";

/**
 * How the engine finds a tool declaration by name. The engine never imports
 * a tool; the application supplies the registry at startup and tests supply
 * a fixture one. This is the only seam between the engine and the tools.
 */
export interface ToolRegistry {
  get(name: string): ToolDeclaration | undefined;
}

let registry: ToolRegistry | null = null;

export function configureEngine(options: { tools: ToolRegistry }): void {
  registry = options.tools;
}

export function resolveTool(name: string): ToolDeclaration | undefined {
  if (!registry) {
    throw new Error(
      "Engine not configured: call configureEngine({ tools }) before executing intents",
    );
  }
  return registry.get(name);
}
