import { z } from "zod";
import { RUN_KINDS } from "./specs";

/**
 * The files a run exchanges with the console, as zod schemas. These are the
 * single source of truth: `context.ts` builds to `ContextFile`, the guard and
 * the run view parse against `PlanFile` and `StructuredOutput`, and the JSON
 * Schema handed to the Devin session is generated from `StructuredOutput`.
 */

const sha = z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 hex digest");
const commit = z.string().regex(/^[0-9a-f]{7,40}$/, "git commit");
const isoDate = z.string().datetime();

/**
 * One refund as Devin sees it: enough to reproduce the pattern in a test,
 * nothing that identifies the customer. `strict` rejects any other key, so a
 * row carrying an email or card number fails to build rather than leaking.
 */
export const EvidenceRow = z
  .object({
    id: z.string().min(1),
    merchant: z.string().min(1),
    reasonCode: z.string().min(1),
    usdMinor: z.number().int().nonnegative(),
    requestedAt: isoDate,
  })
  .strict();
export type EvidenceRow = z.infer<typeof EvidenceRow>;

export const Evidence = z
  .object({
    cluster: z.string().min(1),
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

export const ContextFile = z
  .object({
    run_id: z.string().min(1),
    kind: z.enum(RUN_KINDS),
    spec: z.string().min(1),
    intent: z.string().min(1),
    requested_by: z.string().min(1),
    base: z.object({ branch: z.string().min(1), commit: commit }).strict(),
    /** Path globs the plan must stay inside. */
    scope: z.array(z.string().min(1)),
    constants: z.record(z.string(), z.number()),
    evidence: Evidence,
    reverses: Reverses.nullable(),
    audit_head: z.object({ seq: z.number().int(), rowHash: z.string() }).strict(),
  })
  .strict();
export type ContextFile = z.infer<typeof ContextFile>;

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
    /** Tests a REMOVAL or REVERSAL may delete; absent or empty for other kinds. */
    removed_tests: z.array(RemovedTest).optional(),
  })
  .strict();
export type PlanFile = z.infer<typeof PlanFile>;

export const PHASES = ["intake", "baseline", "plan", "edit", "verify", "pull_request", "merge"] as const;

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
