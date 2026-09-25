import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  frameAt,
  REPLAY_FIXTURES,
  replayDevinClient,
  type StructuredOutput,
} from "@console/tool-automation";
import { ReplayFile } from "@console/tool-automation/run-files";
import { CHECKLIST_GLYPH, runChecklist } from "../../src/lib/run-checklist";

const FIXTURES = join(import.meta.dirname, "../../../../tools/automation/fixtures");

function output(over: Partial<StructuredOutput> = {}): StructuredOutput {
  return {
    phase: "edit",
    phase_status: "running",
    phase_durations_s: {},
    base_commit: null,
    context_sha256: null,
    branch: "devin/run",
    plan_commit: null,
    reuses: [],
    files: [],
    verify_steps: [],
    guards: [],
    conflicts: [],
    pr_url: null,
    stopped_by: null,
    ...over,
  };
}

describe("replay fixtures", () => {
  for (const name of ["implementation", "reversal"] as const) {
    it(`${name}.replay.json validates against the replay.json schema`, () => {
      const raw = JSON.parse(readFileSync(join(FIXTURES, `${name}.replay.json`), "utf8"));
      const parsed = ReplayFile.safeParse(raw);
      expect(parsed.success, JSON.stringify(parsed.error?.issues ?? null)).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.length).toBeGreaterThan(1);
      const times = parsed.data.map((f) => f.at_ms);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      const last = parsed.data[parsed.data.length - 1];
      expect(last.structured_output.phase).toBe("merge");
      expect(last.structured_output.merge_commit).toBeTruthy();
      expect(last.structured_output.pr_url).toBeTruthy();
    });
  }

  it("picks the last frame at or before the elapsed time", () => {
    const fixture = REPLAY_FIXTURES.IMPLEMENTATION;
    expect(frameAt(fixture, -1)).toBe(fixture[0]);
    expect(frameAt(fixture, fixture[1].at_ms)).toBe(fixture[1]);
    expect(frameAt(fixture, Number.MAX_SAFE_INTEGER)).toBe(fixture[fixture.length - 1]);
  });

  it("replay sessions report frames the schema accepts", async () => {
    const devin = replayDevinClient();
    const session = await devin.createSession({
      prompt: "x",
      title: "x",
      tags: ["run:01ARZ3NDEKTSV4RRFFQ69G5FAV", "kind:IMPLEMENTATION/ADDITION"],
      attachment: { name: "context.json", body: "{}" },
      structuredOutputSchema: {},
    });
    const snapshot = await devin.getSession(session.sessionId);
    expect(snapshot.structuredOutput).not.toBeNull();
  });
});

describe("runChecklist", () => {
  it("renders nothing for a missing structured output", () => {
    expect(runChecklist(null)).toEqual([]);
  });

  it("renders no line whose source field is absent", () => {
    const lines = runChecklist(output());
    expect(lines).toEqual([]);
  });

  it("adds a line only once its field carries a value, tagged with that field", () => {
    const withBase = runChecklist(output({ base_commit: "abcdef0123456789" }));
    expect(withBase.map((l) => l.field)).toEqual(["base_commit"]);

    const withPr = runChecklist(
      output({
        base_commit: "abcdef0123456789",
        files: [{ path: "tools/refunds/src/rules.ts", op: "modify", reason: "hold rule", additions: 3, deletions: 1 }],
        pr_url: "https://github.com/o/r/pull/9",
      }),
    );
    expect(withPr.map((l) => l.field)).toEqual(["base_commit", "files", "pr_url"]);
    for (const line of withPr) expect(line.field in output()).toBe(true);
  });

  it("uses the three glyphs for done, running and waiting", () => {
    expect(Object.values(CHECKLIST_GLYPH)).toEqual(["✓", "●", "○"]);
    const lines = runChecklist(
      output({
        phase: "edit",
        phase_status: "running",
        base_commit: "abcdef0123456789",
        files: [{ path: "a.ts", op: "create", reason: "new", additions: 1, deletions: 0 }],
      }),
    );
    expect(lines.map((l) => l.state)).toEqual(["done", "running"]);
  });

  it("every fixture frame yields lines only for fields the frame reports", () => {
    for (const fixture of Object.values(REPLAY_FIXTURES)) {
      for (const frame of fixture) {
        for (const line of runChecklist(frame.structured_output)) {
          const value = frame.structured_output[line.field];
          expect(value === null || value === undefined || (Array.isArray(value) && value.length === 0)).toBe(false);
        }
      }
    }
  });
});
