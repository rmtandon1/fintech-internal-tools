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
 * A change Devin can make from the console. `intents.change` is the short
 * suggestion the requester sees in the request box and can accept with Tab
 * or replace with their own words; the engineering rules every run follows
 * come from docs/DEVIN_RUN_PROTOCOL.md › House rules, not the sentence. The
 * console never parses the spec's prose, and a run whose spec is not sent
 * to Devin never reads it. The reviewer's checklist is copied here too,
 * for the approval dialog.
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
  /**
   * The setting the merged change is switched on with (0 = off). A tool page
   * lists a merged change run's setting as a rule Devin added.
   */
  switchSetting?: string;
  /** The rule's name on screen, e.g. in the tool page's Rules panel. */
  ruleName?: string;
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
      "Once a merchant's \"not received\" refunds add up past the manager limit, send them to a manager for approval. Send those customers' KYC approvals to a manager too.",
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
  switchSetting: "refunds.clustering_hold",
  ruleName: "Refund hold",
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
  title: "Ask Devin to monitor merchants",
  description:
    "Devin builds the monitoring, tests it against recorded responses, and sends it to an engineer to review before it goes live.",
  allowedPaths: [
    "tools/kyc/**",
    "tools/refunds/**",
    "apps/console/src/schema.ts",
    "apps/console/drizzle/**",
    "apps/console/scripts/**",
    "apps/console/package.json",
    ".env.example",
    TESTS,
  ],
  sendSpec: false,
  intents: {
    change:
      "Recheck approved UK merchants against Companies House every day. When one enters administration, liquidation or dissolution, send it and its refunds to a Manager, and link each refund to its merchant's case.",
    undo: "Undo merchant monitoring: remove the daily Companies House recheck, the refund hold and the merchant link, and keep every change made since.",
  },
  summaries: {
    change:
      "Rechecking approved UK merchants on Companies House every day, and sending insolvent merchants and their refunds to a manager.",
    undo: "Removing merchant monitoring, keeping everything merged since.",
  },
  outcomes: {
    change:
      "Merchant monitoring is built and off; once an admin turns it on in rule settings, the daily recheck sends insolvent merchants and their refunds to a manager.",
    undo: "Merchant monitoring is removed. UK merchants are checked on Companies House by hand again.",
  },
  constantKeys: [MANAGER_REVIEW_SCORE_KEY],
  switchSetting: "kyc.merchant_monitoring",
  ruleName: "Merchant monitoring",
  evidence: { tool: "kyc" },
  acceptance: {
    change: [
      "Only approved UK business cases are rechecked, with one Companies House lookup per merchant per run; other cases are untouched.",
      "Administration, liquidation or dissolution adds a material Declared vs found row with the registry's status and current name, and flags the case for a Manager; `declared_vs_found` does the holding, with no duplicate rule.",
      "That merchant's pending refunds and any new ones need a Manager: they leave the Analyst's queue, and the trace names the rule, the merchant and its Companies House status.",
      "Refunds link to the merchant's KYC case by ID, added by a migration that backfills existing refunds; no name matching when a refund is decided.",
      "A refund links to its merchant's case, and the case lists the merchant's refunds (linkedActivity).",
      "An active company changes nothing, and a rerun adds no duplicate checks, findings or holds.",
      "A timeout, an error or an unknown number records \"couldn't check\" and flags the case for a Manager, without holding its refunds.",
      "A daily scheduled entry point and an admin \"Recheck now\" action both write through `executeIntent` as an audited system actor, and report the result across every merchant checked.",
      "`COMPANIES_HOUSE_API_KEY` is read on the server, documented in `.env.example`, and never logged or sent to the browser.",
      "Tests replay recorded responses for active, administration, liquidation, dissolved, not found, an error and a timeout, with no live call; no recording invents a seeded company's result.",
      "The recheck sits behind a KYC rule setting the KYC tool declares, 0 by default; at 0 there are no lookups and no holds.",
    ],
    undo: [
      "`pnpm verify` is green.",
      "The check's tests are gone, and the plan names them. No other test is lost.",
      "Against the addition's base commit, every file it touched is back to its pre-merge content except later merged work, and nothing else changes.",
      "After merge, the next Wilko refund is back in the Analyst's queue and settles when sent, as it did before the change.",
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
      "Start moving the Chargebacks Power App into the console from its export: the queue and the two riskiest rules first, the rest listed as still to do.",
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
