import { describe, expect, it } from "vitest";
import type { StructuredOutput } from "@console/tool-automation";
import { CHECKLIST_GLYPH, runChecklist } from "../../src/lib/run-checklist";

/** A structured output with every optional field absent. */
function output(over: Partial<StructuredOutput> = {}): StructuredOutput {
  return {
    phase: "intake",
    phase_status: "running",
    phase_durations_s: {},
    base_commit: null,
    context_sha256: null,
    branch: null,
    plan_commit: null,
    reuses: [],
    files: [],
    verify_steps: [],
    guards: [],
    conflicts: [],
    pr_url: null,
    merge_commit: null,
    stopped_by: null,
    ...over,
  };
}

describe("runChecklist", () => {
  it("renders no line without a session output or with every field empty", () => {
    expect(runChecklist(null)).toEqual([]);
    expect(runChecklist(output())).toEqual([]);
  });

  it("adds a line only when its source field is present", () => {
    const base = runChecklist(output({ base_commit: "a".repeat(40) }));
    expect(base.map((l) => l.field)).toEqual(["base_commit"]);

    const withPr = runChecklist(
      output({
        phase: "pull_request",
        base_commit: "a".repeat(40),
        files: [{ path: "a.ts", op: "create", reason: "new", additions: 1, deletions: 0 }],
        pr_url: "https://github.com/o/r/pull/1",
      }),
    );
    expect(withPr.map((l) => l.field)).toEqual(["base_commit", "files", "pr_url"]);
  });

  it("lists every changed file, with the last one as the current edit", () => {
    const lines = runChecklist(
      output({
        phase: "edit",
        files: [
          { path: "a.ts", op: "create", reason: "new", additions: 1, deletions: 0 },
          { path: "b.ts", op: "modify", reason: "wire", additions: 2, deletions: 1 },
        ],
      }),
    );
    expect(lines.map((l) => [l.label, l.state])).toEqual([
      ["Adding a.ts", "done"],
      ["Editing b.ts", "running"],
    ]);
  });

  it("uses ✓ ● ○ for done, running and waiting, and ✗ for a failed check", () => {
    expect(CHECKLIST_GLYPH).toEqual({ done: "✓", running: "●", waiting: "○", failed: "✗" });
    const failed = runChecklist(
      output({
        phase: "verify",
        verify_steps: [{ name: "tests", pass: false, before: 68, after: 65 }],
        guards: [{ name: "scope", pass: false }],
      }),
    );
    expect(failed.map((l) => [l.field, l.state])).toEqual([
      ["verify_steps", "done"],
      ["guards", "failed"],
      ["verify_steps", "failed"],
    ]);
  });

  it("names only fields that exist on the structured output", () => {
    const lines = runChecklist(
      output({
        phase: "merge",
        phase_status: "done",
        base_commit: "a".repeat(40),
        reuses: [{ module: "x.ts", reason: "y" }],
        conflicts: [{ file: "c.ts", kept: "a", removed: "b" }],
        files: [{ path: "a.ts", op: "create", reason: "new", additions: 1, deletions: 0 }],
        verify_steps: [{ name: "tests", pass: true, before: 68, after: 70 }],
        guards: [{ name: "scope", pass: true }],
        pr_url: "https://github.com/o/r/pull/1",
        merge_commit: "b".repeat(40),
      }),
    );
    const fields = new Set(Object.keys(output()));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(fields.has(line.field)).toBe(true);
  });
});
