import { and, asc, count, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { db } from "@console/db";
import { defineAction, defineTool } from "@console/engine/declare";
import type {
  ApplyContext,
  ApplyResult,
  GovernedRecord,
  Role,
  Rule,
  SortOption,
} from "@console/engine/types";
import { ROLE_META } from "@console/permissions";
import { devinRuns } from "./schema";
import { seedDevinRuns } from "./seed";
import {
  getSpec,
  IN_FLIGHT_STATUSES,
  OPERATION_LABELS,
  OPERATIONS,
  RUN_STATUSES,
  type Operation,
  type RunnableSpec,
} from "./specs";

export * from "./specs";
export * from "./run-files";
export { buildContext, type BuiltContext, type ContextRequest } from "./context";
export * from "./devin-api";
export * from "./github-api";
export * from "./run-files";

export interface DevinRun extends GovernedRecord {
  id: string;
  operation: string;
  spec: string;
  tool: string;
  intent: string;
  contextSha256: string;
  sessionId: string | null;
  sessionUrl: string | null;
  status: string;
  prUrl: string | null;
  mergeCommit: string | null;
  reverses: string | null;
  requestedBy: string;
  requestedByRole: string;
  approvedBy: string | null;
  lastNote: string | null;
  requestedAt: number;
  updatedAt: number;
  version: number;
}

export const AUTOMATION_ROLES: Role[] = ["manager", "admin", "engineer"];

const STATUS_LABELS: Record<(typeof RUN_STATUSES)[number], string> = {
  dispatched: "Sent to Devin",
  dispatch_failed: "Couldn't start",
  running: "Devin working",
  approved: "Approved",
  merged: "Live",
  stopped: "Stopped",
};

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 hex digest");

const DispatchInput = z.object({
  /** Preassigned run id, so `runs/<id>/context.json` can name the run before it exists. */
  runId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID").optional(),
  spec: z.string().min(1),
  operation: z.enum(OPERATIONS),
  intent: z.string().min(1).max(1000),
  /** SHA-256 of the canonical `context.json` written for this run. */
  contextSha256: sha256,
  /** Record ids the context's evidence block was built from; ids only. */
  evidenceIds: z.array(z.string().min(1)),
  /** For an undo, the merged change run it undoes. */
  reverses: z.string().min(1).nullable().default(null),
});
type DispatchInput = z.infer<typeof DispatchInput>;

type RunRule<TInput> = Rule<DevinRun, TInput>;

/** The spec must be one the console knows; every spec offers both operations. */
const specKnown: RunRule<DispatchInput> = ({ input }) => {
  if (!getSpec(input.spec)) {
    return { type: "deny", rule: "spec_known", reason: "This spec is not registered as runnable" };
  }
  return { type: "allow", rule: "spec_known" };
};

/**
 * Admins may start anything; managers may start a change or an undo on a
 * domain spec; no one else may start a run.
 */
export function roleMayStart(role: Role, spec: RunnableSpec, operation: Operation): boolean {
  if (role === "admin") return true;
  return (
    role === "manager" && spec.domain !== null && (operation === "change" || operation === "undo")
  );
}

/** The operations of `spec` that `role` may dispatch. */
export function operationsStartableBy(role: Role, spec: RunnableSpec): Operation[] {
  return OPERATIONS.filter((operation) => roleMayStart(role, spec, operation));
}

const roleMayStartOperation: RunRule<DispatchInput> = ({ actor, input }) => {
  const spec = getSpec(input.spec);
  if (!spec) return { type: "allow", rule: "role_may_start_operation" };
  const meta = ROLE_META[actor.role];
  return roleMayStart(actor.role, spec, input.operation)
    ? { type: "allow", rule: "role_may_start_operation" }
    : {
        type: "deny",
        rule: "role_may_start_operation",
        reason: `${meta.label} may not start a ${OPERATION_LABELS[input.operation].toLowerCase()} on ${spec.tool}`,
      };
};

/** One run per tool: two branches against the same rules would race to merge. */
const noRunInFlightOnTool: RunRule<DispatchInput> = ({ input }) => {
  const spec = getSpec(input.spec);
  if (!spec) return { type: "allow", rule: "no_run_in_flight_on_tool" };
  const open = db
    .select({ id: devinRuns.id, status: devinRuns.status })
    .from(devinRuns)
    .where(
      and(eq(devinRuns.tool, spec.tool), inArray(devinRuns.status, [...IN_FLIGHT_STATUSES])),
    )
    .get();
  return open
    ? {
        type: "deny",
        rule: "no_run_in_flight_on_tool",
        reason: `Run ${open.id} is already ${open.status} against ${spec.tool}`,
      }
    : { type: "allow", rule: "no_run_in_flight_on_tool" };
};

/** An undo undoes exactly one merged change, and only once. */
const undoNamesMergedChange: RunRule<DispatchInput> = ({ input }) => {
  const rule = "undo_names_merged_change";
  if (input.operation !== "undo") return { type: "allow", rule };
  if (!input.reverses) {
    return { type: "deny", rule, reason: "Undoing a change must name the change it undoes" };
  }
  const target = getRun(input.reverses);
  if (!target || target.operation !== "change") {
    return { type: "deny", rule, reason: `${input.reverses} is not a change that can be undone` };
  }
  if (target.status !== "merged") {
    return { type: "deny", rule, reason: `${target.id} is ${target.status}, not merged` };
  }
  if (target.spec !== input.spec) {
    return { type: "deny", rule, reason: `${target.id} ran a different spec` };
  }
  const prior = db
    .select({ id: devinRuns.id })
    .from(devinRuns)
    .where(and(eq(devinRuns.reverses, target.id), inArray(devinRuns.status, [...IN_FLIGHT_STATUSES, "merged"])))
    .get();
  return prior
    ? { type: "deny", rule, reason: `${target.id} is already reversed by ${prior.id}` }
    : { type: "allow", rule };
};

/** The context a change hands Devin must show the pattern it is for. */
const changeCarriesEvidence: RunRule<DispatchInput> = ({ input }) =>
  input.operation === "change" && input.evidenceIds.length === 0
    ? {
        type: "deny",
        rule: "change_carries_evidence",
        reason: "A change needs at least one evidence row in its context",
      }
    : { type: "allow", rule: "change_carries_evidence" };

const ApproveInput = z.object({
  prUrl: z.string().url(),
  /** Read by the server from the PR's combined status; never supplied by the browser. */
  checksGreen: z.boolean(),
  /** SHA-256 of `runs/<id>/context.json` on the PR branch, read by the server. */
  branchContextSha256: sha256,
  note: z.string().max(500).optional(),
});
type ApproveInput = z.infer<typeof ApproveInput>;

const approverIsNotRequester: RunRule<unknown> = ({ actor, record }) =>
  record && record.requestedBy === actor.id
    ? {
        type: "deny",
        rule: "approver_is_not_requester",
        reason: "The person who asked for the run cannot approve its PR",
      }
    : { type: "allow", rule: "approver_is_not_requester" };

const checksGreen: RunRule<ApproveInput> = ({ input }) =>
  input.checksGreen
    ? { type: "allow", rule: "checks_green" }
    : { type: "deny", rule: "checks_green", reason: "The PR's checks are not green" };

/** The context Devin worked from must be the one the console dispatched. */
const contextMatchesDispatch: RunRule<ApproveInput> = ({ record, input }) =>
  record && record.contextSha256 !== input.branchContextSha256
    ? {
        type: "deny",
        rule: "context_matches_dispatch",
        reason: "context.json on the branch does not match the context that was dispatched",
      }
    : { type: "allow", rule: "context_matches_dispatch" };

/** Managers may act on domain runs; admin and engineer see all. */
const actorOwnsRunDomain: RunRule<unknown> = ({ actor, record }) => {
  const meta = ROLE_META[actor.role];
  const spec = record ? getSpec(record.spec) : undefined;
  const ok = actor.role !== "manager" || (spec !== undefined && spec.domain !== null);
  return ok
    ? { type: "allow", rule: "actor_owns_run_domain" }
    : {
        type: "deny",
        rule: "actor_owns_run_domain",
        reason: `${meta.label} may not act on a ${record?.tool ?? ""} run`,
      };
};

const RecordSessionInput = z.union([
  z.object({ sessionId: z.string().min(1), sessionUrl: z.string().url().nullish() }),
  z.object({ error: z.string().min(1).max(1000) }),
]);
type RecordSessionInput = z.infer<typeof RecordSessionInput>;

const RecordPrInput = z.object({ prUrl: z.string().url() });
type RecordPrInput = z.infer<typeof RecordPrInput>;

/** A run records its pull request once; a repeat, same URL or not, writes nothing. */
const prNotYetRecorded: RunRule<RecordPrInput> = ({ record, input }) =>
  record?.prUrl
    ? {
        type: "deny",
        rule: "pr_not_yet_recorded",
        reason:
          record.prUrl === input.prUrl
            ? `Pull request ${record.prUrl} is already recorded`
            : `Run already has pull request ${record.prUrl}`,
      }
    : { type: "allow", rule: "pr_not_yet_recorded" };

const RecordMergeInput = z.object({
  mergeCommit: z.string().regex(/^[0-9a-f]{7,40}$/),
  prUrl: z.string().url(),
  /** The GitHub login that merged the PR, when GitHub reported one. */
  mergedBy: z.string().min(1).max(100).optional(),
});
type RecordMergeInput = z.infer<typeof RecordMergeInput>;

export const MERGED_WITHOUT_APPROVAL_NOTE = "Merged on GitHub without a recorded approval";

/** The run's note when a merge lands with no recorded approval, naming the merger GitHub reported. */
export function mergedWithoutApprovalNote(mergedBy?: string | null): string {
  return mergedBy
    ? `Merged on GitHub by @${mergedBy} without a recorded approval`
    : MERGED_WITHOUT_APPROVAL_NOTE;
}

/** A merge is a fact GitHub reports; one recorded before any approval is allowed, and named. */
const mergeRecordsApprovalGap: RunRule<RecordMergeInput> = ({ record, input }) =>
  record?.status === "approved"
    ? { type: "allow", rule: "merge_follows_approval" }
    : {
        type: "allow",
        rule: "merge_without_recorded_approval",
        message: mergedWithoutApprovalNote(input.mergedBy),
      };

const StopInput = z.object({ reason: z.string().min(1).max(500) });

interface Transition {
  status: string;
  sessionId?: string | null;
  sessionUrl?: string | null;
  prUrl?: string | null;
  mergeCommit?: string | null;
  approvedBy?: string | null;
  note?: string | null;
}

const SORTABLE = {
  requestedAt: devinRuns.requestedAt,
  updatedAt: devinRuns.updatedAt,
  status: devinRuns.status,
  operation: devinRuns.operation,
  spec: devinRuns.spec,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return desc(devinRuns.requestedAt);
  return sort?.direction === "desc" ? desc(column) : asc(column);
}

export const automationTool = defineTool<DevinRun>({
  name: "automation",
  displayName: "Rule changes",
  description: "Rules Devin writes, reviewed by an engineer before they go live.",
  icon: "Bot",
  group: "Platform",
  recordType: "devin_run",
  visibleTo: AUTOMATION_ROLES,
  fields: [
    { name: "spec", label: "Brief", type: "string" },
    { name: "operation", label: "Type", type: "enum", enumValues: OPERATIONS, enumLabels: OPERATION_LABELS },
    { name: "tool", label: "Tool", type: "string" },
    { name: "intent", label: "Request", type: "text" },
    { name: "contextSha256", label: "Evidence fingerprint", type: "string" },
    { name: "sessionId", label: "Devin session", type: "string" },
    { name: "prUrl", label: "Pull request", type: "string" },
    { name: "mergeCommit", label: "Merge commit", type: "string" },
    { name: "reverses", label: "Undoes", type: "string" },
    { name: "requestedBy", label: "Requested by", type: "string" },
    { name: "requestedByRole", label: "Role", type: "string" },
    { name: "approvedBy", label: "Approved by", type: "string" },
    { name: "lastNote", label: "Last note", type: "text" },
    { name: "requestedAt", label: "Requested", type: "date" },
    { name: "updatedAt", label: "Updated", type: "date" },
  ],
  listColumns: [
    { field: "intent" },
    { field: "operation", sortable: true },
    { field: "status", sortable: true },
    { field: "requestedBy" },
    { field: "requestedAt", sortable: true },
  ],
  filters: [
    {
      field: "status",
      label: "Status",
      type: "enum",
      options: RUN_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
    {
      field: "operation",
      label: "Type",
      type: "enum",
      options: OPERATIONS.map((value) => ({ value, label: OPERATION_LABELS[value] })),
    },
  ],
  sections: [
    { title: "Request", fields: ["intent", "operation", "tool", "reverses"] },
    { title: "Technical details", fields: ["spec", "sessionId", "prUrl", "mergeCommit", "contextSha256"] },
    {
      title: "People",
      fields: ["requestedBy", "requestedByRole", "approvedBy", "lastNote", "requestedAt", "updatedAt"],
    },
  ],
  statuses: [
    { value: "dispatched", label: STATUS_LABELS.dispatched, tone: "info" },
    { value: "dispatch_failed", label: STATUS_LABELS.dispatch_failed, tone: "negative" },
    { value: "running", label: STATUS_LABELS.running, tone: "info" },
    { value: "approved", label: STATUS_LABELS.approved, tone: "positive" },
    { value: "merged", label: STATUS_LABELS.merged, tone: "positive" },
    { value: "stopped", label: STATUS_LABELS.stopped, tone: "neutral" },
  ],
  statusField: "status",
  titleField: "spec",
  revealRoles: [],
  openStatuses: ["dispatched", "running", "approved"],
  actions: [
    defineAction<DevinRun, typeof DispatchInput, DispatchInput>({
      name: "dispatch",
      label: "Ask Devin",
      description: "Ask Devin to run a spec. Creates the run; the session is recorded separately.",
      allowedRoles: ["manager", "admin"],
      input: DispatchInput,
      createsRecord: true,
      tone: "primary",
      rules: [
        specKnown,
        roleMayStartOperation,
        noRunInFlightOnTool,
        undoNamesMergedChange,
        changeCarriesEvidence,
      ],
      decide: ({ input }) => ({
        summary: `Dispatch ${input.operation} of ${input.spec} (context ${input.contextSha256.slice(0, 12)})`,
        patch: input,
        nextStatus: "dispatched",
      }),
      apply: ({ tx, actor, now }, decision) => {
        const input = decision.patch;
        const spec = requireSpec(input.spec);
        const id = input.runId ?? ulid();
        tx.insert(devinRuns)
          .values({
            id,
            operation: input.operation,
            spec: spec.file,
            tool: spec.tool,
            intent: input.intent,
            contextSha256: input.contextSha256,
            sessionId: null,
            sessionUrl: null,
            status: "dispatched",
            prUrl: null,
            mergeCommit: null,
            reverses: input.reverses,
            requestedBy: actor.id,
            requestedByRole: actor.role,
            approvedBy: null,
            lastNote: null,
            requestedAt: now,
            updatedAt: now,
            version: 1,
          })
          .run();
        const after = getRun(id);
        if (!after) throw new Error(`run ${id} vanished mid-apply`);
        return { recordId: id, before: null, after };
      },
    }),
    defineAction<DevinRun, typeof RecordSessionInput, Transition>({
      name: "record_session",
      label: "Record session",
      description: "Store the Devin session id and URL, or the reason the dispatch failed.",
      allowedRoles: ["manager", "admin"],
      input: RecordSessionInput,
      fromStatus: ["dispatched"],
      rules: [actorOwnsRunDomain],
      decide: ({ input }) =>
        "sessionId" in input
          ? {
              summary: `Session ${input.sessionId} is running`,
              patch: { status: "running", sessionId: input.sessionId, sessionUrl: input.sessionUrl ?? null },
              nextStatus: "running",
            }
          : {
              summary: `Dispatch failed: ${input.error}`,
              patch: { status: "dispatch_failed", note: input.error },
              nextStatus: "dispatch_failed",
            },
      apply: (ctx, decision) => transition(ctx, decision.patch),
    }),
    defineAction<DevinRun, typeof RecordPrInput, Transition>({
      name: "record_pr",
      label: "Record pull request",
      description: "Store the pull request the session reports, so it survives a poll that omits it.",
      allowedRoles: AUTOMATION_ROLES,
      input: RecordPrInput,
      fromStatus: ["running"],
      rules: [actorOwnsRunDomain, prNotYetRecorded],
      decide: ({ input }) => ({
        summary: `Pull request opened: ${input.prUrl}`,
        patch: { status: "running", prUrl: input.prUrl },
        nextStatus: "running",
      }),
      apply: (ctx, decision) => transition(ctx, decision.patch),
    }),
    defineAction<DevinRun, typeof ApproveInput, Transition>({
      name: "approve_pr",
      label: "Approve change",
      description:
        "Approve the run's pull request. The server reads the checks and the branch's context.json from GitHub.",
      allowedRoles: ["engineer"],
      input: ApproveInput,
      fromStatus: ["running"],
      tone: "primary",
      rules: [approverIsNotRequester, checksGreen, contextMatchesDispatch],
      decide: ({ actor, input }) => ({
        summary: `Approve ${input.prUrl}`,
        patch: {
          status: "approved",
          prUrl: input.prUrl,
          approvedBy: actor.id,
          note: input.note ?? null,
        },
        nextStatus: "approved",
      }),
      apply: (ctx, decision) => transition(ctx, decision.patch),
    }),
    defineAction<DevinRun, typeof RecordMergeInput, Transition>({
      name: "record_merge",
      label: "Record merge",
      description: "Store the merge commit once the PR has landed, approved from the console or not.",
      allowedRoles: ["engineer", "admin"],
      input: RecordMergeInput,
      fromStatus: ["approved", "running"],
      rules: [mergeRecordsApprovalGap],
      decide: ({ record, input }) => ({
        summary: `Merged as ${input.mergeCommit.slice(0, 12)}`,
        patch: {
          status: "merged",
          mergeCommit: input.mergeCommit,
          prUrl: input.prUrl,
          ...(record?.status === "approved" ? {} : { note: mergedWithoutApprovalNote(input.mergedBy) }),
        },
        nextStatus: "merged",
      }),
      apply: (ctx, decision) => transition(ctx, decision.patch),
    }),
    defineAction<DevinRun, typeof StopInput, Transition>({
      name: "stop",
      label: "Stop",
      description: "Stop the run. The session ends and its PR, if any, is not merged.",
      allowedRoles: ["manager", "admin", "engineer"],
      input: StopInput,
      fromStatus: ["dispatched", "running", "approved"],
      tone: "destructive",
      rules: [actorOwnsRunDomain],
      decide: ({ input }) => ({
        summary: `Stopped: ${input.reason}`,
        patch: { status: "stopped", note: input.reason },
        nextStatus: "stopped",
      }),
      apply: (ctx, decision) => transition(ctx, decision.patch),
    }),
  ],
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses = [];
    if (filters.status) clauses.push(eq(devinRuns.status, filters.status));
    if (filters.operation) clauses.push(eq(devinRuns.operation, filters.operation));
    if (search) {
      clauses.push(
        or(
          like(devinRuns.spec, `%${search}%`),
          like(devinRuns.intent, `%${search}%`),
          eq(devinRuns.id, search),
          eq(devinRuns.sessionId, search),
        ),
      );
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const rows = db
      .select()
      .from(devinRuns)
      .where(where)
      .orderBy(order(sort))
      .limit(limit)
      .offset(offset)
      .all();
    const total = db.select({ id: devinRuns.id }).from(devinRuns).where(where).all().length;
    return { rows, total };
  },
  get: getRun,
  seed: seedDevinRuns,
});

function requireSpec(file: string): RunnableSpec {
  const spec = getSpec(file);
  if (!spec) throw new Error(`no runnable spec ${file}`);
  return spec;
}

function transition(
  { tx, record, now }: ApplyContext<DevinRun, unknown>,
  patch: Transition,
): ApplyResult<DevinRun> {
  if (!record) throw new Error("run transitions require a record");
  tx.update(devinRuns)
    .set({
      status: patch.status,
      sessionId: patch.sessionId ?? record.sessionId,
      sessionUrl: patch.sessionUrl ?? record.sessionUrl,
      prUrl: patch.prUrl ?? record.prUrl,
      mergeCommit: patch.mergeCommit ?? record.mergeCommit,
      approvedBy: patch.approvedBy ?? record.approvedBy,
      lastNote: patch.note ?? record.lastNote,
      updatedAt: now,
      version: record.version + 1,
    })
    .where(and(eq(devinRuns.id, record.id), eq(devinRuns.version, record.version)))
    .run();
  const after = getRun(record.id);
  if (!after) throw new Error(`run ${record.id} vanished mid-apply`);
  return { recordId: record.id, before: record, after };
}

export function getRun(id: string): DevinRun | null {
  return db.select().from(devinRuns).where(eq(devinRuns.id, id)).get() ?? null;
}

export function getRunByPrUrl(prUrl: string): DevinRun | null {
  return db.select().from(devinRuns).where(eq(devinRuns.prUrl, prUrl)).get() ?? null;
}

/** The run that reversed `id`, in flight or merged; null when it has not been reversed. */
export function reversingRun(id: string): DevinRun | null {
  return (
    db
      .select()
      .from(devinRuns)
      .where(
        and(eq(devinRuns.reverses, id), inArray(devinRuns.status, [...IN_FLIGHT_STATUSES, "merged"])),
      )
      .get() ?? null
  );
}

/** One page of runs, newest request first, optionally leaving out one status. */
export function listRuns({
  limit,
  offset = 0,
  excludeStatus,
}: {
  limit: number;
  offset?: number;
  excludeStatus?: string;
}): DevinRun[] {
  return db
    .select()
    .from(devinRuns)
    .where(excludeStatus === undefined ? undefined : ne(devinRuns.status, excludeStatus))
    .orderBy(desc(devinRuns.requestedAt))
    .limit(limit)
    .offset(offset)
    .all();
}

export function countRuns(): number {
  return db.select({ n: count() }).from(devinRuns).get()?.n ?? 0;
}

/** Whether a stored status string is one of the in-flight statuses. */
export function isInFlight(status: string): boolean {
  return IN_FLIGHT_STATUSES.some((s) => s === status);
}
