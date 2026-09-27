import { describe, expect, it } from "vitest";
import { PHASE_ORDER as PHASES } from "@/lib/run-phases";
import { buildReplay, formatClock, replayFrame } from "@/lib/run-replay";
import { allSimulations, defaultSimulation } from "@/lib/simulation";

const source = {
  phase_durations_s: { intake: 10, baseline: 20, edit: 40, verify: 30 },
  files: [
    { path: "a.ts", additions: 5, deletions: 1 },
    { path: "b.ts", additions: 3, deletions: 0 },
  ],
  verify_steps: [{ name: "tests", before: 10, after: 12 }],
  guards: [{ name: "g1" }, { name: "g2" }],
};

describe("run replay", () => {
  it("lays phases end to end in protocol order, skipping ones the run did not report", () => {
    const plan = buildReplay(source, [], [], PHASES);
    expect(plan.total).toBe(100);
    expect(plan.phases).toEqual([
      { phase: "intake", start: 0, end: 10 },
      { phase: "baseline", start: 10, end: 30 },
      { phase: "edit", start: 30, end: 70 },
      { phase: "verify", start: 70, end: 100 },
    ]);
  });

  it("lands each line inside the phase it describes", () => {
    const plan = buildReplay(source, ["one", "two", "three"], ["intake", "edit", "edit"], PHASES);
    expect(plan.lines.map((l) => l.at)).toEqual([0, 30, 50]);
  });

  it("finishes files through the edit phase and guards through verify", () => {
    const plan = buildReplay(source, [], [], PHASES);
    expect(plan.files.every((f) => f.at > 30 && f.at < 70)).toBe(true);
    expect(plan.guards.every((g) => g.at > 70 && g.at < 100)).toBe(true);

    const editing = replayFrame(plan, 60);
    expect(editing.active).toBe(2);
    expect(editing.states).toEqual(["done", "done", "running", "waiting"]);
    expect(editing.progress).toBeCloseTo(0.75);
    expect(editing.filesDone).toBe(2);
    expect(editing.additions).toBe(8);
    expect(editing.testsBefore).toBe(10);
    expect(editing.testsAfter).toBeNull();
    expect(editing.guardsPassed).toBe(0);
  });

  it("starts empty and ends with everything reported", () => {
    const plan = buildReplay(source, ["one"], ["intake"], PHASES);
    const start = replayFrame(plan, 0);
    expect(start).toMatchObject({ active: 0, lines: 1, filesDone: 0, testsBefore: null, done: false });
    const end = replayFrame(plan, plan.total);
    expect(end).toMatchObject({ active: -1, filesDone: 2, testsAfter: 12, guardsPassed: 2, done: true });
    expect(end.states.every((s) => s === "done")).toBe(true);
  });

  it("gives every simulated line a phase, in time order, and matches the reported totals", () => {
    for (const run of allSimulations()) {
      expect(run.beats).toHaveLength(run.sentences.length);
      const plan = buildReplay(run.output, run.sentences, run.beats, PHASES);
      const times = plan.lines.map((l) => l.at);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      const end = replayFrame(plan, plan.total);
      expect(end.filesDone).toBe(run.output.files.length);
      expect(end.lines).toBe(run.sentences.length);
    }
    const first = defaultSimulation();
    expect(formatClock(buildReplay(first.output, first.sentences, first.beats, PHASES).total)).toBe("20:04");
  });
});
