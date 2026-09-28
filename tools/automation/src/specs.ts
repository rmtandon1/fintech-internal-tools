import type { RoleDomain } from "@console/permissions";
import { ADMIN_APPROVAL_USD_KEY, MANAGER_APPROVAL_USD_KEY } from "@console/tool-refunds";

export const RUN_KINDS = [
  "IMPLEMENTATION/ADDITION",
  "IMPLEMENTATION/CHANGE",
  "IMPLEMENTATION/REMOVAL",
  "REVERSAL",
] as const;
export type RunKind = (typeof RUN_KINDS)[number];

/** What each kind is called on screen. */
export const RUN_KIND_LABELS: Record<RunKind, string> = {
  "IMPLEMENTATION/ADDITION": "New rule",
  "IMPLEMENTATION/CHANGE": "Rule change",
  "IMPLEMENTATION/REMOVAL": "Rule removal",
  REVERSAL: "Undo a change",
};

export function runKindLabel(kind: string): string {
  return RUN_KIND_LABELS[kind as RunKind] ?? kind;
}

export const RUN_SCOPES = ["rule", "engine"] as const;
export type RunScope = (typeof RUN_SCOPES)[number];

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

export const IMPLEMENTATION_KINDS: readonly RunKind[] = [
  "IMPLEMENTATION/ADDITION",
  "IMPLEMENTATION/CHANGE",
  "IMPLEMENTATION/REMOVAL",
];

/** Paths engine scope adds to a spec's own list (`DEVIN_RUN_PROTOCOL.md` § Scope). */
export const ENGINE_SCOPE_PATHS: readonly string[] = [
  "packages/engine/**",
  "packages/db/**",
  "packages/db-core/**",
  "packages/db-write/**",
  "packages/permissions/**",
  "apps/console/drizzle/**",
  "apps/console/src/app/actions.ts",
  "apps/console/src/components/**",
  "AGENTS.md",
];

/** Every run may change tests: a behaviour change is written down there, and the reviewer reads it. */
const TESTS = "apps/console/tests/**";

export interface EvidenceSource {
  /** Where the evidence rows are read: a tool's records, or `roadmap` for an app not built yet. */
  tool: string;
}

/**
 * A change Devin can make from the console. The prompt for each kind is
 * written here, ahead of time, so the requester starts from a tested brief
 * and can edit it; the console never parses the spec's prose, and a rule run
 * never reads the spec. The reviewer's checklist is copied here too, for the
 * approval dialog.
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
  kinds: readonly RunKind[];
  scope: RunScope;
  allowedPaths: readonly string[];
  intents: Partial<Record<RunKind, string>>;
  /** The business sentence the run view shows per kind; falls back to intent. */
  summaries: Partial<Record<RunKind, string>>;
  /** One operator-facing line per kind: what changes once the run's PR is merged. */
  outcomes: Partial<Record<RunKind, string>>;
  constantKeys: readonly string[];
  evidence: EvidenceSource;
  /** The reviewer's checklist per kind, copied from the spec's acceptance tests. Shown in the approval dialog; never sent to the session or written to context.json. */
  acceptance: Partial<Record<RunKind, readonly string[]>>;
}

export const COMPANIES_HOUSE_CHECK: RunnableSpec = {
  file: "COMPANIES_HOUSE_CHECK.md",
  tool: "kyc",
  domain: "kyc",
  title: "Ask Devin to add a check",
  description:
    "Devin builds the check, tests it against recorded responses, and sends it to an engineer to review before it goes live.",
  kinds: ["IMPLEMENTATION/ADDITION", "REVERSAL"],
  scope: "rule",
  allowedPaths: ["tools/kyc/**", ".env.example", TESTS],
  intents: {
    "IMPLEMENTATION/ADDITION":
      "Add a Companies House check to UK business cases. Look the company up by its registration number. If it is dissolved, in liquidation or late with its accounts, add that to Declared vs found as material, so a manager has to approve. Read the Companies House API docs on the web first. Without COMPANIES_HOUSE_API_KEY, use recorded responses and label the result as test data; record 09318842 as late with its accounts.",
    REVERSAL:
      "Undo the Companies House check: remove the lookup, its recorded responses and what it adds to the case file, and keep every change made since.",
  },
  summaries: {
    "IMPLEMENTATION/ADDITION":
      "Checking UK business customers against Companies House, and holding approval when the company is dissolved, in liquidation or late with its accounts.",
    REVERSAL: "Removing the Companies House check, keeping everything merged since.",
  },
  outcomes: {
    "IMPLEMENTATION/ADDITION":
      "UK business cases get a Companies House check. A dissolved company, one in liquidation or one late with its accounts needs a KYC manager to approve.",
    REVERSAL: "The Companies House check is removed. The company registry check goes back to being filled in by hand.",
  },
  constantKeys: [],
  evidence: { tool: "kyc" },
  acceptance: {
    "IMPLEMENTATION/ADDITION": [
      "Only UK business cases are checked; consumer and non-UK cases are untouched.",
      "The lookup runs from a KYC action through `executeIntent`; opening a case writes nothing.",
      "`COMPANIES_HOUSE_API_KEY` is read on the server, documented in `.env.example`, and never logged or sent to the browser.",
      "Without the key, recorded responses are used and the check says test data; 09318842 is late with its accounts.",
      "A timeout, an error or an unknown number shows \"couldn't check\" and holds approval.",
      "Results land in `kyc_checks` and `kyc_discrepancies`, and `declared_vs_found` does the holding; no duplicate rule.",
      "Tests cover active, dissolved, in liquidation, accounts overdue, not found and an API error, with no live call.",
    ],
    REVERSAL: [
      "`pnpm verify` is green.",
      "The check's tests are gone, and the plan names them. No other test is lost.",
      "Against the addition's base commit, every file it touched is back to its pre-merge content except later merged work, and nothing else changes.",
    ],
  },
};

export const TWO_PERSON_APPROVAL: RunnableSpec = {
  file: "TWO_PERSON_APPROVAL.md",
  tool: "refunds",
  domain: "refunds",
  title: "Ask Devin for a second approver",
  description:
    "This changes how every approval works, so only an admin can ask, and the engine's owner reviews it as well as an engineer.",
  kinds: ["IMPLEMENTATION/ADDITION", "REVERSAL"],
  scope: "engine",
  allowedPaths: ["tools/refunds/**", "apps/console/src/app/inbox/**", TESTS],
  intents: {
    "IMPLEMENTATION/ADDITION":
      "Refunds at or above the admin limit need two different approvers, each a refunds manager or an admin, before they reach the processor, and the person who asked can't be one of them. Agreed with engineering: an approval request records each approver and applies once enough have approved; nobody approves the same request twice; requests already waiting still need one. Show 1 of 2 in the inbox.",
    REVERSAL:
      "Undo the two-person approval: large refunds go back to one approver, the approval records already written stay, and every change made since is kept.",
  },
  summaries: {
    "IMPLEMENTATION/ADDITION":
      "Requiring two different approvers, each a refunds manager or an admin and neither the requester, for refunds at or above the admin limit.",
    REVERSAL: "Going back to one approver for large refunds, keeping everything merged since.",
  },
  outcomes: {
    "IMPLEMENTATION/ADDITION":
      "Refunds at or above the admin limit wait for two different approvers. The inbox shows how many have approved.",
    REVERSAL: "Large refunds need one approver again.",
  },
  constantKeys: [ADMIN_APPROVAL_USD_KEY, MANAGER_APPROVAL_USD_KEY],
  evidence: { tool: "refunds" },
  acceptance: {
    "IMPLEMENTATION/ADDITION": [
      "The approval request carries how many approvals it needs (default 1) and a record of each approver; any tool's rule can ask for two.",
      "Each approval is its own audit row, and the effect applies in the same transaction as the last one.",
      "Nobody approves the same request twice, and the requester never approves, enforced where approvals are decided.",
      "A request created before the change still applies on one approval.",
      "The migration is additive: existing approval rows keep working.",
      "The inbox shows \"1 of 2\" and who has approved.",
      "Tests: two different approvers apply it; the same approver twice and the requester are refused; an old request needs one.",
    ],
    REVERSAL: [
      "`pnpm verify` is green.",
      "Approval records already written stay readable.",
      "Against the addition's base commit, every file it touched is back to its pre-merge content except later merged work, and nothing else changes.",
    ],
  },
};

export const CHARGEBACKS_FROM_POWER_APPS: RunnableSpec = {
  file: "CHARGEBACKS_FROM_POWER_APPS.md",
  tool: "chargebacks",
  domain: null,
  title: "Ask Devin to build this app",
  description:
    "Devin rebuilds the app from its Power Apps export. It adds a table, so the engine's owner reviews it as well as an engineer.",
  kinds: ["IMPLEMENTATION/ADDITION", "REVERSAL"],
  scope: "engine",
  allowedPaths: [
    "tools/chargebacks/**",
    "apps/console/src/registry.ts",
    "apps/console/src/schema.ts",
    "apps/console/src/lib/modes.ts",
    "apps/console/package.json",
    "pnpm-lock.yaml",
    TESTS,
  ],
  intents: {
    "IMPLEMENTATION/ADDITION":
      "Rebuild the Chargebacks Power App as a console app from the export in fixtures/power-apps/chargebacks. Keep its fields and actions, seed it from disputes.csv, and turn every condition in its Power Automate flows into a rule, and its deadline alert into a count on the queue. The refunds team works it, so use the refunds roles. In the pull request, list each flow step next to what replaced it, and flag anything with no equivalent.",
    REVERSAL:
      "Remove the Chargebacks app: its tool, tables, seed and registry lines, and keep every change made since.",
  },
  summaries: {
    "IMPLEMENTATION/ADDITION":
      "Rebuilding the Chargebacks Power App as a console app, with each flow condition as a rule.",
    REVERSAL: "Removing the Chargebacks app, keeping everything merged since.",
  },
  outcomes: {
    "IMPLEMENTATION/ADDITION":
      "Chargebacks is live in the console, with the Power App's fields and actions, and a rule for each condition its flow checked.",
    REVERSAL: "Chargebacks goes back to Coming soon.",
  },
  constantKeys: [],
  evidence: { tool: "roadmap" },
  acceptance: {
    "IMPLEMENTATION/ADDITION": [
      "The pull request maps each formula and flow condition to what replaced it, and flags what has no equivalent.",
      "Accepting a fraud dispute over $500 needs a refunds manager; fighting over $2,500 needs a refunds manager's approval.",
      "Fighting without evidence is denied, and every decision carries a note.",
      "Acting on a dispute past its deadline is denied; a count shows open disputes over $1,000 due within 48 hours.",
      "The seed keeps each date's offset from the export time, so three disputes are due soon on the day of the demo.",
      "New files sit under `tools/chargebacks/`, plus a registry line, a schema re-export, a migration and the lockfile; nothing under `packages/`.",
    ],
    REVERSAL: [
      "`pnpm verify` is green.",
      "The app's tool, tables, seed and registry lines are gone; nothing else changes.",
    ],
  },
};

export const SPECS: readonly RunnableSpec[] = [
  COMPANIES_HOUSE_CHECK,
  TWO_PERSON_APPROVAL,
  CHARGEBACKS_FROM_POWER_APPS,
];

export function getSpec(file: string): RunnableSpec | undefined {
  return SPECS.find((s) => s.file === file);
}

/** The path globs a run of `spec` at `scope` may plan to touch, plus its own `runs/` dir. */
export function scopePaths(spec: RunnableSpec, scope: RunScope, runId: string): string[] {
  const own = [`runs/${runId}/**`];
  return scope === "engine"
    ? [...spec.allowedPaths, ...ENGINE_SCOPE_PATHS, ...own]
    : [...spec.allowedPaths, ...own];
}
