import { describe, expect, it } from "vitest";
import { shouldToggleAgentWindow } from "@/lib/agent-window-shortcut";

describe("agent window shortcut guard", () => {
  it("toggles on `]` with no target", () => {
    expect(shouldToggleAgentWindow("]", null)).toBe(true);
  });

  it("toggles on `]` over a non-editable element", () => {
    expect(
      shouldToggleAgentWindow("]", { tagName: "DIV", isContentEditable: false }),
    ).toBe(true);
  });

  it("ignores other keys", () => {
    expect(shouldToggleAgentWindow("[", null)).toBe(false);
    expect(shouldToggleAgentWindow("Escape", null)).toBe(false);
  });

  it("ignores `]` inside editable form elements", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(
        shouldToggleAgentWindow("]", { tagName, isContentEditable: false }),
      ).toBe(false);
    }
  });

  it("ignores `]` inside a contentEditable element", () => {
    expect(
      shouldToggleAgentWindow("]", { tagName: "DIV", isContentEditable: true }),
    ).toBe(false);
  });
});
