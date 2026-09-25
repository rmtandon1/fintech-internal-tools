import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
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
  IMPLEMENTATION_KINDS,
  IN_FLIGHT_STATUSES,
  RUN_KINDS,
  RUN_SCOPES,
  RUN_STATUSES,
  type RunKind,
  type RunnableSpec,
} from "./specs";

export * from "./specs";
export * from "./run-files";
export { buildContext, type BuiltContext, type ContextRequest } from "./context";
export * from "./devin-api";
export * from "./github-api";

export interface DevinRun extends GovernedRecord {
  id: string;
  kind: string;
  spec: string;
  tool: string;
  scope: string;
  intent: string;
  contextSha256: string;
  sessionId: string | null;
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

export const AUTOMATION_ROLES: Role[] = ["refunds_manager", "kyc_manager", "admin", "engineer"];

const STATUS_LABELS: Record<(typeof RUN_STATUSES)[number], string> = {
  dispatched: "Dispatched",
  dispatch_failed: "Dispatch failed",
  running: "Running",
  approved: "Approved",
  merged: "Merged",
  stopped: "Stopped",
};

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 hex digest");

const DispatchInput = z.object({
  /** Preassigned run id, so `runs/<id>/context.json` can name the run before it exists. */
  runId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID").optional(),
  spec: z.string().min(1),
  kind: z.enum(RUN_KINDS),
  scope: z.enum(RUN_SCOPES),
  intent: z.string().min(1).max(500),
  /** SHA-256 of the canonical `context.json` written for this run. */
  contextSha256: sha256,
  /** Record ids the context's evidence block was built from; ids only. */
  evidenceIds: z.array(z.string().min(1)),
  /** For a REVERSAL, the merged IMPLEMENTATION run it undoes. */
  reverses: z.string().min(1).nullable().default(null),
});
type DispatchInput = z.infer<typeof DispatchInput>;

type RunRule<TInput> = Rule<DevinRun, TInput>;

const allow =
  <TInput>(rule: string): RunRule<TInput> =>
  () => ({ type: "allow", rule });

/** The spec must be one the console knows and must offer the requested kind. */
const specKnown: RunRule<DispatchInput> = ({ input }) => {
  const spec = getSpec(input.spec);
  if (!spec) {
    return { type: "deny", rule: "spec_known", reason: `No runnable spec ${input.spec}` };
  }
  if (!spec.kinds.includes(input.kind)) {
    return {
      type: "deny",
      rule: "spec_known",
      reason: `${spec.file} does not support ${input.kind}`,
    };
  }
  return { type: "allow", rule: "spec_known" };
};

/**
 * DEVIN_RUN_PROTOCOL.md § Run kinds: the manager of the spec's domain or the
 * admin may ask for an addition or change; only the admin may ask for a
 * removal or reversal.
 */
export function roleMayStart(role: Role, spec: RunnableSpec, kind: RunKind): boolean {
  const meta = ROLE_META[role];
  const adminOnly = kind === "IMPLEMENTATION/REMOVAL" || kind === "REVERSAL";
  return (
    meta.level === "admin" ||
    (!adminOnly && meta.level === "manager" && meta.domain === spec.domain)
  );
}

/** The kinds of `spec` that `role` may dispatch, in the spec's own order. */
export function kindsStartableBy(role: Role, spec: RunnableSpec): RunKind[] {
  return spec.kinds.filter((kind) => roleMayStart(role, spec, kind));
}

const roleMayStartKind: RunRule<DispatchInput> = ({ actor, input }) => {
  const spec = getSpec(input.spec);
  if (!spec) return { type: "allow", rule: "role_may_start_kind" };
  const meta = ROLE_META[actor.role];
  return roleMayStart(actor.role, spec, input.kind)
    ? { type: "allow", rule: "role_may_start_kind" }
    : {
        type: "deny",
        rule: "role_may_start_kind",
        reason: `${meta.label} may not start ${input.kind} against ${spec.file}`,
      };
};

/** § Scope: a run that may touch `packages/engine` is the admin's to start. */
const engineScopeAdminOnly: RunRule<DispatchInput> = ({ actor, input }) =>
  input.scope === "engine" && ROLE_META[actor.role].level !== "admin"
    ? {
        type: "deny",
        rule: "engine_scope_admin_only",
        reason: "Only the admin may dispatch a run with engine scope",
      }
    : { type: "allow", rule: "engine_scope_admin_only" };

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

/** A reversal undoes exactly one merged implementation, and only once. */
const reversalNamesMergedImplementation: RunRule<DispatchInput> = ({ input }) => {
  const rule = "reversal_names_merged_implementation";
  if (input.kind !== "REVERSAL") return { type: "allow", rule };
  if (!input.reverses) {
    return { type: "deny", rule, reason: "A REVERSAL must name the run it reverses" };
  }
  const target = getRun(input.reverses);
  if (!target || !IMPLEMENTATION_KINDS.includes(target.kind as RunKind)) {
    return { type: "deny", rule, reason: `${input.reverses} is not an IMPLEMENTATION run` };
  }
  if (target.status !== "merged") {
    return { type: "deny", rule, reason: `${target.id} is ${target.status}, not merged` };
  }
  if (target.spec !== input.spec) {
    return { type: "deny", rule, reason: `${target.id} ran ${target.spec}, not ${input.spec}` };
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

/** The context an implementation hands Devin must show the pattern it is for. */
const implementationCarriesEvidence: RunRule<DispatchInput> = ({ input }) =>
  IMPLEMENTATION_KINDS.includes(input.kind) && input.evidenceIds.length === 0
    ? {
        type: "deny",
        rule: "implementation_carries_evidence",
        reason: "An IMPLEMENTATION run needs at least one evidence row in its context",
      }
    : { type: "allow", rule: "implementation_carries_evidence" };

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

/** A manager touches only runs against their own domain; admin and engineer see all. */
const actorOwnsRunDomain: RunRule<unknown> = ({ actor, record }) => {
  const meta = ROLE_META[actor.role];
  const spec = record ? getSpec(record.spec) : undefined;
  const ok = meta.level !== "manager" || (spec !== undefined && spec.domain === meta.domain);
  return ok
    ? { type: "allow", rule: "actor_owns_run_domain" }
    : {
        type: "deny",
        rule: "actor_owns_run_domain",
        reason: `${meta.label} may not act on a ${record?.tool ?? ""} run`,
      };
};

const RecordSessionInput = z.union([
  z.object({ sessionId: z.string().min(1) }),
  z.object({ error: z.string().min(1).max(1000) }),
]);
type RecordSessionInput = z.infer<typeof RecordSessionInput>;

const RecordPrInput = z.object({ prUrl: z.string().url() });
type RecordPrInput = z.infer<typeof RecordPrInput>;

/** The session names its pull request once; a later, different URL is a new run's business. */
const prNotYetRecorded: RunRule<RecordPrInput> = ({ record, input }) =>
  record?.prUrl && record.prUrl !== input.prUrl
    ? {
        type: "deny",
        rule: "pr_not_yet_recorded",
        reason: `Run already has pull request ${record.prUrl}`,
      }
    : { type: "allow", rule: "pr_not_yet_recorded" };

const RecordMergeInput = z.object({
  mergeCommit: z.string().regex(/^[0-9a-f]{7,40}$/),
  prUrl: z.string().url(),
});
type RecordMergeInput = z.infer<typeof RecordMergeInput>;

const StopInput = z.object({ reason: z.string().min(1).max(500) });

interface Transition {
  status: string;
  sessionId?: string | null;
  prUrl?: string | null;
  mergeCommit?: string | null;
  approvedBy?: string | null;
  note?: string | null;
}

const SORTABLE = {
  requestedAt: devinRuns.requestedAt,
  updatedAt: devinRuns.updatedAt,
  status: devinRuns.status,
  kind: devinRuns.kind,
  spec: devinRuns.spec,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return desc(devinRuns.requestedAt);
  return sort?.direction === "desc" ? desc(column) : asc(column);
}

export const automationTool = defineTool<DevinRun>({
  name: "automation",
  displayName: "Automation",
  description: "Devin runs against the console's rules: dispatched, approved and merged under audit.",
  icon: "Bot",
  group: "Platform",
  recordType: "devin_run",
  visibleTo: AUTOMATION_ROLES,
  fields: [
    { name: "spec", label: "Spec", type: "string" },
    { name: "kind", label: "Kind", type: "enum", enumValues: RUN_KINDS },
    { name: "tool", label: "Tool", type: "string" },
    { name: "scope", label: "Scope", type: "enum", enumValues: RUN_SCOPES },
    { name: "intent", label: "Intent", type: "text" },
    { name: "contextSha256", label: "Context SHA-256", type: "string" },
    { name: "sessionId", label: "Session", type: "string" },
    { name: "prUrl", label: "Pull request", type: "string" },
    { name: "mergeCommit", label: "Merge commit", type: "string" },
    { name: "reverses", label: "Reverses", type: "string" },
    { name: "requestedBy", label: "Requested by", type: "string" },
    { name: "requestedByRole", label: "Requested as", type: "string" },
    { name: "approvedBy", label: "Approved by", type: "string" },
    { name: "lastNote", label: "Last note", type: "text" },
    { name: "requestedAt", label: "Requested", type: "date" },
    { name: "updatedAt", label: "Updated", type: "date" },
  ],
  listColumns: [
    { field: "spec", sortable: true },
    { field: "kind", sortable: true },
    { field: "scope" },
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
      field: "kind",
      label: "Kind",
      type: "enum",
      options: RUN_KINDS.map((value) => ({ value, label: value })),
    },
  ],
  sections: [
    { title: "Run", fields: ["spec", "kind", "tool", "scope", "intent", "reverses"] },
    { title: "Session", fields: ["contextSha256", "sessionId", "prUrl", "mergeCommit"] },
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
      label: "Dispatch",
      description: "Ask Devin to run a spec. Creates the run; the session is recorded separately.",
      allowedRoles: ["refunds_manager", "kyc_manager", "admin"],
      input: DispatchInput,
      createsRecord: true,
      tone: "primary",
      rules: [
        specKnown,
        roleMayStartKind,
        engineScopeAdminOnly,
        noRunInFlightOnTool,
        reversalNamesMergedImplementation,
        implementationCarriesEvidence,
      ],
      decide: ({ input }) => ({
        summary: `Dispatch ${input.kind} of ${input.spec} (context ${input.contextSha256.slice(0, 12)})`,
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
            kind: input.kind,
            spec: spec.file,
            tool: spec.tool,
            scope: input.scope,
            intent: input.intent,
            contextSha256: input.contextSha256,
            sessionId: null,
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
      description: "Store the Devin session id, or the reason the dispatch failed.",
      allowedRoles: ["refunds_manager", "kyc_manager", "admin"],
      input: RecordSessionInput,
      fromStatus: ["dispatched"],
      rules: [actorOwnsRunDomain],
      decide: ({ input }) =>
        "sessionId" in input
          ? {
              summary: `Session ${input.sessionId} is running`,
              patch: { status: "running", sessionId: input.sessionId },
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
      label: "Approve PR",
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
      description: "Store the merge commit once the approved PR has landed.",
      allowedRoles: ["engineer", "admin"],
      input: RecordMergeInput,
      fromStatus: ["approved"],
      rules: [allow("merge_follows_approval")],
      decide: ({ input }) => ({
        summary: `Merged as ${input.mergeCommit.slice(0, 12)}`,
        patch: { status: "merged", mergeCommit: input.mergeCommit, prUrl: input.prUrl },
        nextStatus: "merged",
      }),
      apply: (ctx, decision) => transition(ctx, decision.patch),
    }),
    defineAction<DevinRun, typeof StopInput, Transition>({
      name: "stop",
      label: "Stop",
      description: "Stop the run. The session ends and its PR, if any, is not merged.",
      allowedRoles: ["refunds_manager", "kyc_manager", "admin", "engineer"],
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
    if (filters.kind) clauses.push(eq(devinRuns.kind, filters.kind));
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
