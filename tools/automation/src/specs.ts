import type { RoleDomain } from "@console/permissions";
import { MANAGER_REVIEW_SCORE_KEY } from "@console/tool-kyc";
import { MANAGER_APPROVAL_USD_KEY } from "@console/tool-refunds";

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

export interface EvidenceSource {
  /** `ClusterDecl.id` on the tool the evidence comes from. */
  cluster: string;
  tool: string;
}

/**
 * A spec Devin can run. Everything here is copied from the spec file so the
 * console never parses prose: the kinds it supports, the paths its Scope
 * section allows, the intent sentence for each kind, and the constants the
 * rule reads, which `context.json` snapshots at dispatch.
 */
export interface RunnableSpec {
  file: string;
  /** The tool whose rules change; the domain whose manager may ask for it. */
  tool: string;
  domain: RoleDomain;
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
}

export const REFUND_CLUSTERING_HOLD: RunnableSpec = {
  file: "REFUND_CLUSTERING_HOLD.md",
  tool: "refunds",
  domain: "refunds",
  kinds: ["IMPLEMENTATION/ADDITION", "REVERSAL"],
  scope: "rule",
  allowedPaths: [
    "tools/refunds/src/clustering-hold.ts",
    "tools/refunds/src/index.ts",
    "tools/kyc/src/index.ts",
    "apps/console/tests/tools/refunds-clustering-hold.test.ts",
    "apps/console/tests/tools/kyc.test.ts",
  ],
  intents: {
    "IMPLEMENTATION/ADDITION":
      "Once a merchant's \"not received\" refunds add up past the manager limit, send them to a manager for approval. Send those customers' KYC approvals to a manager too.",
    REVERSAL:
      "Undo the refund hold: remove the refund rule, the linked KYC rule and its time-window setting, and keep every change made since.",
  },
  summaries: {
    "IMPLEMENTATION/ADDITION":
      "Holding the merchant's not-received refunds once together they pass the manager line, and sending those customers' KYC approvals to a manager.",
    REVERSAL: "Removing the hold, keeping everything merged since.",
  },
  outcomes: {
    "IMPLEMENTATION/ADDITION":
      "A merchant's \"not received\" refunds go to a manager once together they pass the manager limit, and those customers' KYC approvals go to a manager too.",
    REVERSAL:
      "The refund hold and the linked KYC rule are removed. Refunds and KYC approvals work as they did before.",
  },
  constantKeys: [MANAGER_APPROVAL_USD_KEY, MANAGER_REVIEW_SCORE_KEY],
  evidence: { cluster: "merchant_not_received", tool: "refunds" },
};

export const SPECS: readonly RunnableSpec[] = [REFUND_CLUSTERING_HOLD];

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
