import { describe, expect, it } from "vitest";
import type { StructuredOutput } from "@console/tool-automation";
import { sharedPathsTouched } from "@/lib/run-surface";

function output(paths: string[]): StructuredOutput {
  return {
    phase: "edit",
    phase_status: "running",
    phase_durations_s: {},
    base_commit: null,
    context_sha256: null,
    branch: "devin/run",
    plan_commit: null,
    reuses: [],
    files: paths.map((path) => ({ path, op: "modify", additions: 1, deletions: 0, reason: "x" })),
    verify_steps: [],
    guards: [],
    conflicts: [],
    pr_url: null,
    stopped_by: null,
  };
}

describe("sharedPathsTouched", () => {
  it("names the shared paths the reported files touch", () => {
    expect(
      sharedPathsTouched(output(["tools/kyc/src/index.ts", "apps/console/drizzle/0009_x.sql"])),
    ).toEqual(["apps/console/drizzle/0009_x.sql"]);
  });

  it("is empty for a tools-only diff and for no reported output", () => {
    expect(sharedPathsTouched(output(["tools/kyc/src/index.ts"]))).toEqual([]);
    expect(sharedPathsTouched(null)).toEqual([]);
    expect(sharedPathsTouched(undefined)).toEqual([]);
  });
});
