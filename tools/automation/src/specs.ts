import type { RoleDomain } from "@console/permissions";
import { MANAGER_REVIEW_SCORE_KEY } from "@console/tool-kyc";
import { MANAGER_APPROVAL_USD_KEY } from "@console/tool-refunds";

export const OPERATIONS = ["change", "undo"] as const;
export type Operation = (typeof OPERATIONS)[number];

/** What each operation is called on screen. */
export const OPERATION_LABELS: Record<Operation, string> = {
  change: "Change",
  undo: "Undo a change",
};

export function operationLabel(operation: string): string {
  return OPERATION_LABELS[operation as Operation] ?? operation;
}

export const RUN_STATUSES = [
  "dispatched",
  "dispatch_failed",
  "running",
  "approved",
  "merged",
  "stopped",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Statuses that hold the tool: a second dispatch against it is denied. */
export const IN_FLIGHT_STATUSES: readonly RunStatus[] = ["dispatched", "running", "approved"];

/** Every run may change tests: a behaviour change is written down there, and the reviewer reads it. */
const TESTS = "apps/console/tests/**";

export interface EvidenceSource {
  /** Where the evidence rows are read: a tool's records, or `roadmap` for an app not built yet. */
  tool: string;
  /** `ClusterDecl.id` when the evidence is a group of that tool's records, not one record. */
  cluster?: string;
}

/**
 * A change Devin can make from the console. The prompt for each operation is
 * written here, ahead of time, so the requester starts from a tested brief
 * and can edit it; the console never parses the spec's prose, and a run
 * whose spec is not sent to Devin never reads it. The reviewer's checklist
 * is copied here too, for the approval dialog.
 */
export interface RunnableSpec {
  file: string;
  /** The tool the run changes: one run in flight per tool. */
  tool: string;
  /** The domain whose manager may ask for it; null when only the admin may. */
  domain: RoleDomain | null;
  /** The handoff panel's heading and the button that opens it. */
  title: string;
  /** One line under the heading: what happens after the requester sends it. */
  description: string;
  /** Every path a change may plan to touch. Shared paths (packages/**, drizzle, actions.ts) are listed here explicitly when a spec needs them. */
  allowedPaths: readonly string[];
  /** True when the session must read the spec's "sent to Devin" sections (today: Chargebacks). */
  sendSpec: boolean;
  intents: Record<Operation, string>;
  /** The business sentence the run view shows per operation; falls back to intent. */
  summaries: Record<Operation, string>;
  /** One operator-facing line per operation: what changes once the run's PR is merged. */
  outcomes: Record<Operation, string>;
  constantKeys: readonly string[];
  evidence: EvidenceSource;
  /** The reviewer's checklist per operation, copied from the spec's acceptance tests. Shown in the approval dialog; never sent to the session or written to context.json. */
  acceptance: Record<Operation, readonly string[]>;
}

export const REFUND_CLUSTERING_HOLD: RunnableSpec = {
  file: "REFUND_CLUSTERING_HOLD.md",
  tool: "refunds",
  domain: "refunds",
  title: "Ask Devin for a rule",
  description:
    "Describe what the rule should do. Devin writes it, tests it, and sends it to an engineer to review before it goes live.",
  allowedPaths: [
    "tools/refunds/src/clustering-hold.ts",
    "tools/refunds/src/index.ts",
    "tools/kyc/src/index.ts",
    TESTS,
  ],
  sendSpec: false,
  intents: {
    change:
      "Once a merchant's \"not received\" refunds add up past the manager limit, route them to a manager's queue for direct payment or rejection. Send those customers' KYC approvals to a manager too.",
    undo: "Undo the refund hold: remove the refund rule, the linked KYC rule and its time-window setting, and keep every change made since.",
  },
  summaries: {
    change:
      "Devin is routing split refunds that add up past the manager limit to the manager's queue.",
    undo: "Devin is removing the split-refund hold, keeping everything merged since.",
  },
  outcomes: {
    change:
      "A merchant's \"not received\" refunds go to the manager's queue once together they pass the manager limit, where the manager can pay or reject them; those customers' KYC approvals go to a manager too.",
    undo: "The refund hold and the linked KYC rule are removed. Refunds and KYC approvals work as they did before.",
  },
  constantKeys: [MANAGER_APPROVAL_USD_KEY, MANAGER_REVIEW_SCORE_KEY],
  evidence: { tool: "refunds", cluster: "merchant_not_received" },
  acceptance: {
    change: [
      "The first refund in a cluster whose running total is under the manager line is applied.",
      "The refund that takes the merchant's `not_received` total over the manager line within the window needs a manager: it leaves the analyst's queue for the manager's. The trace names `clustering_hold`, the merchant and the running total.",
      "Every later refund in the same cluster is routed to the manager's queue too.",
      "A `faulty` refund from the same merchant is not affected.",
      "Rejected refunds don't count toward the total.",
      "With `refunds.clustering_window_days` at 0, `clustering_hold` reads allow and no refund is routed by this rule. This is the KILL_SWITCH setting.",
      "Approving a case whose email matches a customer in a held cluster needs a manager, whatever the risk score. The trace names `linked_refund_hold`.",
      "A case whose customer has no held refunds is unchanged. Score 68 still clears.",
      "The existing KYC and refund tests that count or order the rules are changed on purpose and named in the plan; no test is lost.",
    ],
    undo: [
      "`pnpm verify` is green.",
      "The eight hold tests are gone, and the plan names them. No other test is lost.",
      "Against the change's base commit, every file it touched is back to its pre-merge content except later merged work, and nothing else changes.",
      "After merge, the next Kestrel refund is back in the analyst's queue and settles when sent, as it did before the change.",
    ],
  },
};

export const COMPANIES_HOUSE_CHECK: RunnableSpec = {
  file: "COMPANIES_HOUSE_CHECK.md",
  tool: "kyc",
  domain: "kyc",
  title: "Ask Devin to add a check",
  description:
    "Devin builds the check, tests it against recorded responses, and sends it to an engineer to review before it goes live.",
  allowedPaths: ["tools/kyc/**", ".env.example", TESTS],
  sendSpec: false,
  intents: {
    change:
      "Add a Companies House check to UK business cases. Look the company up by its registration number. If it is dissolved, in liquidation or late with its accounts, add that to Declared vs found as material, so a manager has to approve. Read the Companies House API docs on the web first. Without COMPANIES_HOUSE_API_KEY, use recorded responses and label the result as test data; record 09318842 as late with its accounts. Put the check behind a setting `kyc.companies_house_check` in rule settings, off by default, so an admin turns it on after the merge; when off, cases are unchanged.",
    undo: "Undo the Companies House check: remove the lookup, its recorded responses and what it adds to the case file, and keep every change made since.",
  },
  summaries: {
    change:
      "Checking UK business customers against Companies House, and holding approval when the company is dissolved, in liquidation or late with its accounts.",
    undo: "Removing the Companies House check, keeping everything merged since.",
  },
  outcomes: {
    change:
      "The Companies House check is built and off; turning `kyc.companies_house_check` on in rule settings runs it on every UK business case and sends late or dissolved companies to a manager.",
    undo: "The Companies House check is removed. The company registry check goes back to being filled in by hand.",
  },
  constantKeys: ["kyc.companies_house_check"],
  evidence: { tool: "kyc" },
  acceptance: {
    change: [
      "Only UK business cases are checked; consumer and non-UK cases are untouched.",
      "The lookup runs from a KYC action through `executeIntent`; opening a case writes nothing.",
      "`COMPANIES_HOUSE_API_KEY` is read on the server, documented in `.env.example`, and never logged or sent to the browser.",
      "Without the key, recorded responses are used and the check says test data; 09318842 is late with its accounts.",
      "A timeout, an error or an unknown number shows \"couldn't check\" and holds approval.",
      "Results land in `kyc_checks` and `kyc_discrepancies`, and `declared_vs_found` does the holding; no duplicate rule.",
      "Tests cover active, dissolved, in liquidation, accounts overdue, not found and an API error, with no live call.",
      "With `kyc.companies_house_check` off (the default) no case changes; on, the check runs. The setting is declared by the KYC tool.",
    ],
    undo: [
      "`pnpm verify` is green.",
      "The check's tests are gone, and the plan names them. No other test is lost.",
      "Against the addition's base commit, every file it touched is back to its pre-merge content except later merged work, and nothing else changes.",
    ],
  },
};

export const CHARGEBACKS_FROM_POWER_APPS: RunnableSpec = {
  file: "CHARGEBACKS_FROM_POWER_APPS.md",
  tool: "chargebacks",
  domain: null,
  title: "Ask Devin to start this app",
  description:
    "Devin makes the first pull request of the move from the Power Apps export. It adds a table, so the engine's owner reviews it as well as an engineer.",
  allowedPaths: [
    "tools/chargebacks/**",
    "apps/console/src/registry.ts",
    "apps/console/src/schema.ts",
    "apps/console/src/lib/modes.ts",
    "apps/console/package.json",
    "apps/console/drizzle/**",
    "pnpm-lock.yaml",
    "tools/flags/src/seed.ts",
    TESTS,
  ],
  sendSpec: true,
  intents: {
    change:
      "Start moving the Chargebacks Power App into the console, from the export in fixtures/power-apps/chargebacks. This is the first pull request, not the whole app: the queue with its fields, seeded from disputes.csv; the deadline alert as a count on the queue; and the two riskiest rules, fraud accepts over $500 and fights over $2,500, each needing a manager. Use the manager role. In the pull request, list every formula and flow step as done or still to do. Put the app behind the feature flag `app.chargebacks` in Feature flags: set the mode's `flag` and seed the row off and not customer-facing in `tools/flags/src/seed.ts` for fresh databases — the console registers it on start for existing ones — so an admin turns it on after the merge.",
    undo: "Remove the Chargebacks app: its tool, tables, seed and registry lines, and keep every change made since.",
  },
  summaries: {
    change:
      "Starting the Chargebacks move: the queue, its disputes, the deadline count and the two riskiest rules, with the rest listed as still to do.",
    undo: "Removing the Chargebacks app, keeping everything merged since.",
  },
  outcomes: {
    change:
      "Chargebacks is built and switched off; turning on `app.chargebacks` in Feature flags shows the queue, the 50 disputes, a count of those due within 48 hours, and manager approval for large fraud accepts and fights.",
    undo: "Chargebacks goes back to Coming soon.",
  },
  constantKeys: [],
  evidence: { tool: "roadmap" },
  acceptance: {
    change: [
      "The pull request lists every formula and flow step from the export as done in this pull request or still to do.",
      "The queue shows the export's fields, seeded from disputes.csv with each date's offset from the export time kept, so three disputes are due soon on the day of the demo.",
      "A count on the queue shows open disputes over $1,000 due within 48 hours.",
      "Accepting a fraud dispute over $500, and fighting one over $2,500, each need a manager.",
      "The manager role works it; nothing new in the role catalog.",
      "New files sit under `tools/chargebacks/`, plus a registry line, a schema re-export, a migration and the lockfile; nothing under `packages/`.",
      "The app sits behind the `app.chargebacks` feature flag: the mode's `flag` is `app.chargebacks`, and the row is seeded off and not customer-facing in `tools/flags/src/seed.ts` for fresh databases — the console registers it on start for existing ones; the tile reads Switched off until an admin turns it on.",
    ],
    undo: [
      "`pnpm verify` is green.",
      "The app's tool, tables, seed and registry lines are gone; nothing else changes.",
    ],
  },
};

export const SPECS: readonly RunnableSpec[] = [
  REFUND_CLUSTERING_HOLD,
  COMPANIES_HOUSE_CHECK,
  CHARGEBACKS_FROM_POWER_APPS,
];

export function getSpec(file: string): RunnableSpec | undefined {
  return SPECS.find((s) => s.file === file);
}

/** The path globs a run of `spec` may plan to touch, plus its own `runs/` dir. */
export function allowedPaths(spec: RunnableSpec, runId: string): string[] {
  return [...spec.allowedPaths, `runs/${runId}/**`];
}
