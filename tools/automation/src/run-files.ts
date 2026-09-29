import { z } from "zod";
import { PHASES } from "./phases";
import { OPERATIONS } from "./specs";

/**
 * The files a run exchanges with the console, as zod schemas. These are the
 * single source of truth: `context.ts` builds to `ContextFile`, the guard and
 * the run view parse against `PlanFile` and `StructuredOutput`, and the JSON
 * Schema handed to the Devin session is generated from `StructuredOutput`.
 */

const sha = z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 hex digest");
const commit = z.string().regex(/^[0-9a-f]{7,40}$/, "git commit");

/**
 * One record as Devin sees it: an id and a few named facts, read column by
 * column from an allowlist in `context.ts`. Nothing else can be carried, so a
 * row that would need an email or a card number to make sense can't be built.
 */
export const EvidenceRow = z
  .object({
    id: z.string().min(1),
    facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();
export type EvidenceRow = z.infer<typeof EvidenceRow>;

export const Evidence = z
  .object({
    /** `<tool>:<key>`: where the rows were read from, e.g. `kyc:kyc_0003`. */
    source: z.string().min(1),
    rows: z.array(EvidenceRow),
  })
  .strict();
export type Evidence = z.infer<typeof Evidence>;

export const Reverses = z
  .object({
    run_id: z.string().min(1),
    merge_commit: commit,
    /** That run's `constants` block, when `runs/<run_id>/context.json` is on disk. */
    constants_at_dispatch: z.record(z.string(), z.number()).nullable(),
  })
  .strict();
export type Reverses = z.infer<typeof Reverses>;

const ContextFileShape = z
  .object({
    run_id: z.string().min(1),
    operation: z.enum(OPERATIONS),
    spec: z.string().min(1),
    intent: z.string().min(1),
    requested_by: z.string().min(1),
    base: z.object({ branch: z.string().min(1), commit: commit }).strict(),
    /** Path globs the plan must stay inside. */
    allowed_paths: z.array(z.string().min(1)),
    constants: z.record(z.string(), z.number()),
    evidence: Evidence,
    reverses: Reverses.nullable(),
    audit_head: z.object({ seq: z.number().int(), rowHash: z.string() }).strict(),
  })
  .strict();
/**
 * Context files written before the operation model carry `kind` + `scope`
 * where the current shape has `operation` + `allowed_paths`. Map them on read;
 * the bytes — and the dispatch SHA over them — are untouched.
 */
export const ContextFile = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const out = { ...input };
  if (typeof input.kind === "string" && input.operation === undefined) {
    out.operation = input.kind === "REVERSAL" ? "undo" : "change";
    delete out.kind;
  }
  if (Array.isArray(input.scope) && input.allowed_paths === undefined) {
    out.allowed_paths = input.scope;
    delete out.scope;
  }
  return out;
}, ContextFileShape);
export type ContextFile = z.infer<typeof ContextFileShape>;

export const PlannedFile = z
  .object({
    path: z.string().min(1),
    op: z.enum(["create", "modify", "delete"]),
    reason: z.string().min(1),
  })
  .strict();

export const Reuse = z.object({ module: z.string().min(1), reason: z.string().min(1) }).strict();

export const RemovedTest = z.object({ file: z.string().min(1), name: z.string().min(1) }).strict();

export const PlanFile = z
  .object({
    files: z.array(PlannedFile),
    reuses: z.array(Reuse),
    acceptance: z.array(z.string().min(1)),
    /** Tests the run may delete; the reviewer permits exactly the listed removals. */
    removed_tests: z.array(RemovedTest).optional(),
  })
  .strict();
export type PlanFile = z.infer<typeof PlanFile>;

export { PHASES } from "./phases";

/** The PR's required checks: exactly what `pnpm verify` runs. */
export const CI_CHECKS = ["Lint", "Typecheck", "Boundaries", "Test"] as const;

export const StructuredOutput = z
  .object({
    phase: z.enum(PHASES),
    phase_status: z.enum(["running", "done", "stopped", "waiting_for_user"]),
    phase_durations_s: z.partialRecord(z.enum(PHASES), z.number().nonnegative()),
    base_commit: commit.nullable(),
    context_sha256: sha.nullable(),
    branch: z.string().nullable(),
    plan_commit: commit.nullable(),
    reuses: z.array(Reuse),
    files: z.array(
      PlannedFile.extend({
        additions: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
      }).strict(),
    ),
    verify_steps: z.array(
      z
        .object({
          name: z.string().min(1),
          pass: z.boolean().nullable(),
          before: z.number().int().nonnegative().optional(),
          after: z.number().int().nonnegative().nullable().optional(),
        })
        .strict(),
    ),
    /** Short plain sentences on what Devin did that the other fields don't show, tagged with the phase. */
    notes: z.array(z.object({ phase: z.enum(PHASES), text: z.string().min(1) }).strict()).optional(),
    guards: z.array(z.object({ name: z.string().min(1), pass: z.boolean().nullable() }).strict()),
    conflicts: z.array(
      z.object({ file: z.string().min(1), kept: z.string(), removed: z.string() }).strict(),
    ),
    pr_url: z.string().url().nullable(),
    merge_commit: commit.nullable().optional(),
    stopped_by: z.string().nullable(),
  })
  .strict();
export type StructuredOutput = z.infer<typeof StructuredOutput>;

/** What the console hands the session as `structured_output_schema`. */
export const STRUCTURED_OUTPUT_JSON_SCHEMA = z.toJSONSchema(StructuredOutput, {
  target: "draft-7",
});

export const ReplayFrame = z
  .object({
    at_ms: z.number().int().nonnegative(),
    structured_output: StructuredOutput,
    status: z.string().min(1),
    status_detail: z.string().nullable(),
  })
  .strict();
export type ReplayFrame = z.infer<typeof ReplayFrame>;

export const ReplayFile = z.array(ReplayFrame);
export type ReplayFile = z.infer<typeof ReplayFile>;
