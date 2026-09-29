import type { StructuredOutput } from "@console/tool-automation/run-files";

/**
 * Words for the phases a Devin session reports. Kept free of runtime imports
 * so client components can use them without pulling in the run-file schemas.
 */
type Phase = StructuredOutput["phase"];

export const PHASE_ORDER: readonly Phase[] = [
  "intake",
  "baseline",
  "plan",
  "edit",
  "verify",
  "pull_request",
  "merge",
];

export const PHASE_LABELS: Record<Phase, string> = {
  intake: "Reading the request",
  baseline: "Running the existing tests",
  plan: "Planning the change",
  edit: "Making the change",
  verify: "Testing the change",
  pull_request: "Ready for review",
  merge: "Going live",
};

/** Short names for the timeline under a run. */
export const PHASE_SHORT: Record<Phase, string> = {
  intake: "Read",
  baseline: "Baseline",
  plan: "Plan",
  edit: "Edit",
  verify: "Verify",
  pull_request: "Review",
  merge: "Live",
};

/**
 * One entry per gate, in first-seen order, carrying the last result Devin
 * reported for it. A session that reruns a gate after a fix sometimes appends
 * a second row instead of updating the first.
 */
export function latestVerifySteps(
  steps: StructuredOutput["verify_steps"],
): StructuredOutput["verify_steps"] {
  const byName = new Map<string, StructuredOutput["verify_steps"][number]>();
  for (const step of steps) byName.set(step.name, step);
  return [...byName.values()];
}

export const PHASE_STATUS_LABELS: Record<StructuredOutput["phase_status"], string> = {
  running: "in progress",
  done: "done",
  stopped: "stopped",
  waiting_for_user: "waiting for an engineer",
};
