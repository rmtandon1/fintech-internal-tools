import { z } from "zod";

/**
 * The main/agent split, saved in a cookie so the server renders the last
 * layout and the page does not jump on load.
 */
export const WORKSPACE_LAYOUT_COOKIE = "console-workspace-layout";

export type WorkspaceLayout = Record<string, number>;

const layoutSchema = z.record(z.string(), z.number().min(0).max(100));

export function parseWorkspaceLayout(value: string | undefined): WorkspaceLayout | undefined {
  if (!value) return undefined;
  try {
    const parsed = layoutSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
