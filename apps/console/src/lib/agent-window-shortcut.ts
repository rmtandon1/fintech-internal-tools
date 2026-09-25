export const AGENT_WINDOW_KEY = "]";

export interface ShortcutTarget {
  tagName: string;
  isContentEditable: boolean;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when a keydown should toggle the Devin window: the `]` key outside any editable element. */
export function shouldToggleAgentWindow(key: string, target: ShortcutTarget | null): boolean {
  if (key !== AGENT_WINDOW_KEY) return false;
  if (!target) return true;
  return !target.isContentEditable && !EDITABLE_TAGS.has(target.tagName);
}
