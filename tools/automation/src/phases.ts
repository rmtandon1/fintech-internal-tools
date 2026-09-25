/**
 * The phases a run reports, in order. Kept in its own module so the run
 * view's checklist (a client bundle) can read them without pulling in the
 * specs and run-files modules, which carry server-side dependencies.
 */
export const PHASES = ["intake", "baseline", "plan", "edit", "verify", "pull_request", "merge"] as const;

export type Phase = (typeof PHASES)[number];
