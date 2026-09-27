import { REFUND_CLUSTERING_HOLD, RUN_KIND_LABELS, type RunKind } from "@console/tool-automation";
import { StructuredOutput } from "@console/tool-automation/run-files";
import { runChecklist, type ChecklistLine } from "@/lib/run-checklist";

/**
 * Simulation mode: what the console shows when `DEVIN_API_KEY` is not set.
 * Every line here is pre-written, never observed. It is what a finished run
 * of the spec would report, so a viewer can see the shape of the work without
 * a Devin session. Simulated runs are never written to `devin_runs` or the
 * audit chain, and every surface that shows one labels it as simulated.
 */
export interface SimulatedRun {
  spec: string;
  kind: RunKind;
  /** How the kind is named on screen. */
  kindLabel: string;
  intent: string;
  /** What the operator would read as the run progresses, in order. */
  sentences: string[];
  /** The phase each sentence belongs to, one per sentence; the replay lands it there. */
  beats: StructuredOutput["phase"][];
  /** The run view's checklist for the finished run, from the same projection a live run uses. */
  checklist: ChecklistLine[];
  /** The finished run's structured output, which the run report lays out. */
  output: StructuredOutput;
}

const SIM_CONTEXT_SHA = "5e".repeat(32);

const TEST_FILE = "apps/console/tests/tools/refunds-clustering-hold.test.ts";

const GUARDS = [
  "Stays in plan",
  "Plan stays in scope",
  "Run dir frozen",
  "Engine untouched",
  "Tests never shrink",
  "No type escapes",
  "Seed is not state",
];

const ADDITION = StructuredOutput.parse({
  phase: "pull_request",
  phase_status: "done",
  phase_durations_s: { intake: 41, baseline: 212, plan: 96, edit: 604, verify: 233, pull_request: 18 },
  base_commit: "1a67f60",
  context_sha256: SIM_CONTEXT_SHA,
  branch: "devin/<run_id>-clustering-hold",
  plan_commit: "c7d19e2",
  reuses: [
    { module: "packages/engine/src/execute-intent.ts", reason: "the hold is a policy rule on the existing intent path" },
    { module: "packages/engine/src/approvals.ts", reason: "held refunds go to the existing manager tier" },
    { module: "tools/refunds/src/clusters.ts", reason: "same merchant and window grouping as the cluster drawer" },
  ],
  files: [
    { path: "tools/refunds/src/clustering-hold.ts", op: "create", reason: "clustering_hold rule and the shared held-customer query", additions: 84, deletions: 0 },
    { path: "tools/refunds/src/index.ts", op: "modify", reason: "register the rule after goodwill_approval; declare the window constant", additions: 11, deletions: 1 },
    { path: "tools/kyc/src/index.ts", op: "modify", reason: "linked_refund_hold on approve", additions: 12, deletions: 1 },
    { path: TEST_FILE, op: "create", reason: "acceptance tests 1-6 from the Kestrel evidence", additions: 131, deletions: 0 },
    { path: "apps/console/tests/tools/kyc.test.ts", op: "modify", reason: "acceptance tests 7-8", additions: 38, deletions: 0 },
  ],
  verify_steps: [
    { name: "lint", pass: true },
    { name: "typecheck", pass: true },
    { name: "boundaries", pass: true },
    { name: "tests", pass: true, before: 246, after: 254 },
  ],
  guards: GUARDS.map((name) => ({ name, pass: true })),
  conflicts: [],
  pr_url: null,
  merge_commit: null,
  stopped_by: null,
});

const REVERSAL = StructuredOutput.parse({
  phase: "pull_request",
  phase_status: "done",
  phase_durations_s: { intake: 38, baseline: 205, plan: 71, edit: 412, verify: 229, pull_request: 16 },
  base_commit: "3f0b9d2",
  context_sha256: SIM_CONTEXT_SHA,
  branch: "devin/<run_id>-reverse-clustering-hold",
  plan_commit: "e41a7c0",
  reuses: [],
  files: [
    { path: "tools/refunds/src/clustering-hold.ts", op: "delete", reason: "the rule being reversed", additions: 0, deletions: 84 },
    { path: "tools/refunds/src/index.ts", op: "modify", reason: "drop the registration and window constant; keep partial_delivery", additions: 1, deletions: 11 },
    { path: "tools/kyc/src/index.ts", op: "modify", reason: "drop linked_refund_hold", additions: 1, deletions: 12 },
    { path: TEST_FILE, op: "delete", reason: "tests 1-6 assert the removed rule; listed in removed_tests", additions: 0, deletions: 131 },
    { path: "apps/console/tests/tools/kyc.test.ts", op: "modify", reason: "tests 7-8 assert the removed rule; listed in removed_tests", additions: 0, deletions: 38 },
  ],
  verify_steps: [
    { name: "lint", pass: true },
    { name: "typecheck", pass: true },
    { name: "boundaries", pass: true },
    { name: "tests", pass: true, before: 256, after: 248 },
  ],
  guards: [...GUARDS, "Only undo"].map((name) => ({ name, pass: true })),
  conflicts: [
    {
      file: "tools/refunds/src/index.ts",
      kept: "partial_delivery reason code (later PR)",
      removed: "clustering_hold registration",
    },
  ],
  pr_url: null,
  merge_commit: null,
  stopped_by: null,
});

const SIMULATIONS: SimulatedRun[] = [
  {
    spec: REFUND_CLUSTERING_HOLD.file,
    kind: "IMPLEMENTATION/ADDITION",
    kindLabel: RUN_KIND_LABELS["IMPLEMENTATION/ADDITION"],
    intent: REFUND_CLUSTERING_HOLD.intents["IMPLEMENTATION/ADDITION"] ?? "",
    sentences: [
      "Read your request and the four Kestrel refunds you sent, then checked how refund approvals work today.",
      "Ran the full test suite before changing anything. All 246 tests pass.",
      "Wrote down which five files it would change before touching any code.",
      "Added a rule that holds a merchant's \"not received\" refunds for a manager once together they pass the manager limit. An admin can switch it off on the rule settings page.",
      "Left out rejected refunds and used the exchange rate from the day each refund was requested. Your request didn't mention either.",
      "Made KYC approvals for those customers go to a manager too.",
      "Added eight tests built from the four Kestrel refunds.",
      "Every check passes. The change is waiting for an engineer to review and approve it.",
    ],
    beats: ["intake", "baseline", "plan", "edit", "edit", "edit", "edit", "verify"],
    checklist: runChecklist(ADDITION),
    output: ADDITION,
  },
  {
    spec: REFUND_CLUSTERING_HOLD.file,
    kind: "REVERSAL",
    kindLabel: RUN_KIND_LABELS.REVERSAL,
    intent: REFUND_CLUSTERING_HOLD.intents.REVERSAL ?? "",
    sentences: [
      "Started from the change that added the hold.",
      "A later change edited the same file to add the \"partial delivery\" reason. Kept that and removed only the hold.",
      "Removed the KYC link and the window setting, and deleted only the eight tests that checked the hold.",
      "Checked that the undo adds nothing new.",
      "Listed what code can't undo: refunds still waiting in the manager inbox, and the window setting an admin set to 0.",
    ],
    beats: ["intake", "edit", "edit", "verify", "pull_request"],
    checklist: runChecklist(REVERSAL),
    output: REVERSAL,
  },
];

export function simulatedRun(spec: string, kind: string): SimulatedRun | null {
  return SIMULATIONS.find((s) => s.spec === spec && s.kind === kind) ?? null;
}

/** The finished run the Devin window shows in simulation mode. */
export function defaultSimulation(): SimulatedRun {
  return SIMULATIONS[0];
}

export function allSimulations(): readonly SimulatedRun[] {
  return SIMULATIONS;
}

/** The simulated run for each kind a dispatch dialog offers, keyed by kind. */
export function simulationsFor(
  spec: string,
  kinds: readonly string[],
): Partial<Record<string, SimulatedRun>> {
  const out: Partial<Record<string, SimulatedRun>> = {};
  for (const kind of kinds) {
    const run = simulatedRun(spec, kind);
    if (run) out[kind] = run;
  }
  return out;
}
