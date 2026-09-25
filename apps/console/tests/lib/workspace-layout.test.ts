import { describe, expect, it } from "vitest";
import { parseWorkspaceLayout } from "@/lib/workspace-layout";

describe("parseWorkspaceLayout", () => {
  it("returns a saved layout", () => {
    const value = JSON.stringify({ "workspace-main": 72, "workspace-agent": 28 });
    expect(parseWorkspaceLayout(value)).toEqual({
      "workspace-main": 72,
      "workspace-agent": 28,
    });
  });

  it("keeps a collapsed agent column", () => {
    const value = JSON.stringify({ "workspace-main": 100, "workspace-agent": 0 });
    expect(parseWorkspaceLayout(value)?.["workspace-agent"]).toBe(0);
  });

  it("falls back to the default layout on a missing or malformed cookie", () => {
    expect(parseWorkspaceLayout(undefined)).toBeUndefined();
    expect(parseWorkspaceLayout("")).toBeUndefined();
    expect(parseWorkspaceLayout("{not json")).toBeUndefined();
    expect(parseWorkspaceLayout(JSON.stringify({ "workspace-main": "wide" }))).toBeUndefined();
    expect(parseWorkspaceLayout(JSON.stringify({ "workspace-main": 140 }))).toBeUndefined();
    expect(parseWorkspaceLayout(JSON.stringify([72, 28]))).toBeUndefined();
  });
});
