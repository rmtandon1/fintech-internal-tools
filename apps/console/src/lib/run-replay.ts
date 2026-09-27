import type { ChecklistState } from "@/lib/checklist-glyph";

/**
 * A finished run laid out on its own clock, so the console can play it back:
 * phases take the time the run reported for them, the narrative lines land
 * inside the phase they describe, files finish one by one through the edit
 * phase and guards pass one by one through verify. Times are run seconds.
 *
 * Only type imports here: the replay component runs in the browser and must
 * not pull in the run-file schemas.
 */

export interface ReplayPlan {
  total: number;
  phases: { phase: string; start: number; end: number }[];
  lines: { at: number; text: string }[];
  files: { at: number; path: string; additions: number; deletions: number }[];
  tests: { before: number | null; after: number | null; beforeAt: number; afterAt: number };
  guards: { at: number; name: string }[];
}

/** The slice of a run's structured output a replay reads. */
export interface ReplaySource {
  phase_durations_s: Partial<Record<string, number>>;
  files: { path: string; additions: number; deletions: number }[];
  verify_steps: { name: string; before?: number; after?: number | null }[];
  guards: { name: string }[];
}

export function buildReplay(
  output: ReplaySource,
  sentences: readonly string[],
  beats: readonly string[],
  order: readonly string[],
): ReplayPlan {
  const phases: ReplayPlan["phases"] = [];
  let clock = 0;
  for (const phase of order) {
    const seconds = output.phase_durations_s[phase];
    if (seconds === undefined) continue;
    phases.push({ phase, start: clock, end: clock + seconds });
    clock += seconds;
  }
  const span = (phase: string) => phases.find((p) => p.phase === phase);
  /** The k-th of n events spread through a phase, finishing before it ends. */
  const within = (phase: string, k: number, n: number) => {
    const p = span(phase);
    return p ? p.start + ((p.end - p.start) * (k + 1)) / (n + 1) : 0;
  };

  const lines: ReplayPlan["lines"] = [];
  sentences.forEach((text, i) => {
    const phase = beats[i] ?? "";
    const p = span(phase);
    const peers = beats.filter((b) => b === phase).length;
    const nth = beats.slice(0, i).filter((b) => b === phase).length;
    const at = p ? p.start + ((p.end - p.start) * nth) / Math.max(1, peers) : (lines.at(-1)?.at ?? 0);
    lines.push({ at, text });
  });

  const tests = output.verify_steps.find((s) => s.name === "tests");
  return {
    total: clock,
    phases,
    lines,
    files: output.files.map((f, k) => ({
      at: within("edit", k, output.files.length),
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    })),
    tests: {
      before: tests?.before ?? null,
      after: tests?.after ?? null,
      beforeAt: span("baseline")?.end ?? span("intake")?.end ?? 0,
      afterAt: span("verify")?.end ?? clock,
    },
    guards: output.guards.map((g, k) => ({
      at: within("verify", k, output.guards.length),
      name: g.name,
    })),
  };
}

export interface ReplayFrame {
  states: ChecklistState[];
  /** Index of the running phase; -1 before the start and once finished. */
  active: number;
  /** How far through the running phase, 0..1. */
  progress: number;
  lines: number;
  filesDone: number;
  additions: number;
  deletions: number;
  testsBefore: number | null;
  testsAfter: number | null;
  guardsPassed: number;
  done: boolean;
}

export function replayFrame(plan: ReplayPlan, t: number): ReplayFrame {
  const done = t >= plan.total;
  const active = done ? -1 : plan.phases.findIndex((p) => t >= p.start && t < p.end);
  const current = plan.phases[active];
  const files = plan.files.filter((f) => f.at <= t);
  return {
    states: plan.phases.map((p) => (t >= p.end ? "done" : t >= p.start ? "running" : "waiting")),
    active,
    progress: current ? (t - current.start) / (current.end - current.start || 1) : done ? 1 : 0,
    lines: plan.lines.filter((l) => l.at <= t).length,
    filesDone: files.length,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    testsBefore: t >= plan.tests.beforeAt ? plan.tests.before : null,
    testsAfter: t >= plan.tests.afterAt ? plan.tests.after : null,
    guardsPassed: plan.guards.filter((g) => g.at <= t).length,
    done,
  };
}

/** `20:04` from 1204 run seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
