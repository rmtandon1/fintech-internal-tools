import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@console/db";
import { defineAction, defineTool } from "@console/engine/declare";
import { DEMO_ACTORS } from "@console/engine/actor";
import { loadConstants } from "@console/engine/policy/constants";
import { evaluatePolicy } from "@console/engine/policy/evaluate";
import type {
  Actor,
  ApplyContext,
  ApplyResult,
  GovernedRecord,
  Rule,
  RuleContext,
  RuleOutcome,
  SortOption,
  StatusDecl,
} from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { clusteringHold } from "./clustering-hold";
import { CLUSTERING_WINDOW_DAYS_KEY, MANAGER_APPROVAL_USD_KEY, notReceivedByMerchant } from "./clusters";
import { refunds } from "./schema";
import { seedRefunds } from "./seed";

export {
  CLUSTERING_WINDOW_DAYS_KEY,
  MANAGER_APPROVAL_USD_KEY,
  clusteringWindowDays,
  notReceivedByMerchant,
} from "./clusters";
export { clusterHoldFor, clusterHoldForCustomer, clusterHoldReason } from "./clustering-hold";

export interface Refund extends GovernedRecord {
  id: string;
  paymentId: string;
  customerEmail: string;
  cardLast4: string;
  merchant: string;
  psp: string;
  currency: string;
  capturedMinor: number;
  refundedMinor: number;
  amountMinor: number;
  usdMinor: number;
  reasonCode: string;
  disputed: number;
  status: string;
  requestedBy: string | null;
  requestedAt: number;
  settledAt: number | null;
  lastNote: string | null;
  version: number;
  /** Whose queue the refund sits in, set on listed rows; null once rejected. */
  queue?: RefundQueue | null;
}

export type RefundQueue = "analyst" | "manager";

/** The queue badge on a listed refund. */
export const QUEUE_CHIPS: StatusDecl[] = [
  { value: "analyst", label: "Analyst", tone: "neutral" },
  { value: "manager", label: "Manager", tone: "warning" },
];

export const GOODWILL_APPROVAL_USD_KEY = "refunds.goodwill_approval_usd_minor";

type RefundRule = Rule<Refund, unknown>;

/** A refund may never take the payment below zero, pending amounts included. */
const withinCapturedAmount: RefundRule = ({ record }) =>
  record && record.refundedMinor + record.amountMinor > record.capturedMinor
    ? {
        type: "deny",
        rule: "within_captured_amount",
        reason: `Refund is more than the ${money(record.capturedMinor - record.refundedMinor, record.currency)} left on the payment`,
      }
    : { type: "allow", rule: "within_captured_amount" };

/** A disputed payment is the scheme's to settle; refunding it double-pays. */
const notDisputed: RefundRule = ({ record }) =>
  record && record.disputed === 1
    ? {
        type: "deny",
        rule: "not_disputed",
        reason: "Customer has an open chargeback on this payment",
      }
    : { type: "allow", rule: "not_disputed" };

const amountApproval: RefundRule = ({ record, constants }) => {
  const managerUsd = constants.number(MANAGER_APPROVAL_USD_KEY, 50_000);
  const usd = record?.usdMinor ?? 0;
  if (usd >= managerUsd) {
    return {
      type: "require_approval",
      rule: "amount_approval",
      tier: "manager",
      allowedRoles: rolesFor("refunds", "manager"),
      reason: "Amount exceeds manager threshold",
    };
  }
  return { type: "allow", rule: "amount_approval" };
};

/** Goodwill has no underlying failure, so it gets a lower approval bar. */
const goodwillApproval: RefundRule = ({ record, constants }) => {
  const limit = constants.number(GOODWILL_APPROVAL_USD_KEY, 5_000);
  return record && record.reasonCode === "goodwill" && record.usdMinor >= limit
    ? {
        type: "require_approval",
        rule: "goodwill_approval",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: "Goodwill refund exceeds manager threshold",
      }
    : { type: "allow", rule: "goodwill_approval" };
};

const allow =
  (rule: string): RefundRule =>
  () => ({ type: "allow", rule });

type ApprovalOutcome = Extract<RuleOutcome, { type: "require_approval" }>;

function managerRoute(ctx: RuleContext<Refund, unknown>): ApprovalOutcome | null {
  const execute = refundTool.actions.find((action) => action.name === "execute");
  if (!execute) throw new Error("refunds.execute is not declared");
  const decision = evaluatePolicy(execute.rules, {
    ...ctx,
    actor: DEMO_ACTORS.analyst,
    tool: "refunds",
    action: "execute",
    input: {},
    constants: loadConstants(),
  });
  if (decision.effect === "deny") return null;
  return (
    decision.trace.find(
      (outcome): outcome is ApprovalOutcome => outcome.type === "require_approval",
    ) ?? null
  );
}

function managerRouteFor(record: Refund): ApprovalOutcome | null {
  return managerRoute({
    actor: DEMO_ACTORS.analyst,
    tool: "refunds",
    action: "execute",
    record,
    input: {},
    constants: loadConstants(),
  });
}

/**
 * The queue a refund sits in right now: the manager's when the live execute
 * rules would route an analyst's send to a manager, otherwise the analyst's.
 * A rejected refund is in neither.
 */
export function queueOf(record: Refund): RefundQueue | null {
  if (record.status === "rejected") return null;
  const routed =
    (record.status === "requested" || record.status === "failed") && managerRouteFor(record) !== null;
  return routed ? "manager" : "analyst";
}

const paymentApprover: RefundRule = (ctx) => {
  const route = managerRoute(ctx);
  return route
    ? { ...route, rule: "payment_approver" }
    : { type: "allow", rule: "payment_approver" };
};

const SORTABLE = {
  id: refunds.id,
  paymentId: refunds.paymentId,
  merchant: refunds.merchant,
  amountMinor: refunds.usdMinor,
  status: refunds.status,
  requestedAt: refunds.requestedAt,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return desc(refunds.usdMinor);
  return sort?.direction === "asc" ? asc(column) : desc(column);
}

export const refundTool = defineTool<Refund>({
  name: "refunds",
  displayName: "Refunds",
  description: "Pay or reject customer refund requests.",
  icon: "Undo2",
  group: "Money Movement",
  recordType: "refund",
  visibleTo: [...rolesFor("refunds", "agent"), "admin"],
  defaultFilters: (actor: Actor): Record<string, string> =>
    actor.role === "analyst"
      ? { queue: "analyst" }
      : actor.role === "manager"
        ? { queue: "manager" }
        : {},
  fields: [
    { name: "paymentId", label: "Payment", type: "string" },
    { name: "merchant", label: "Merchant", type: "string" },
    { name: "customerEmail", label: "Customer email", type: "string", isPII: true },
    { name: "cardLast4", label: "Card", type: "string", isPII: true, revealTail: 4 },
    { name: "psp", label: "Processor", type: "string" },
    {
      name: "amountMinor",
      label: "Refund amount",
      type: "currency",
      currencyField: "currency",
    },
    {
      name: "capturedMinor",
      label: "Captured",
      type: "currency",
      currencyField: "currency",
    },
    {
      name: "refundedMinor",
      label: "Already refunded",
      type: "currency",
      currencyField: "currency",
    },
    {
      name: "usdMinor",
      label: "USD equivalent",
      type: "currency",
      currency: "USD",
      help: "Converted at the rate on the day of the request.",
    },
    { name: "currency", label: "Currency", type: "string" },
    {
      name: "reasonCode",
      label: "Reason",
      type: "enum",
      enumValues: ["duplicate", "not_received", "faulty", "cancelled", "goodwill", "fraud", "partial_delivery"],
    },
    { name: "disputed", label: "Dispute open", type: "boolean" },
    {
      name: "queue",
      label: "Queue",
      type: "enum",
      enumValues: ["analyst", "manager"],
      enumLabels: { analyst: "Analyst", manager: "Manager" },
    },
    { name: "requestedBy", label: "Requested by", type: "string" },
    { name: "requestedAt", label: "Requested", type: "date" },
    { name: "settledAt", label: "Settled", type: "date" },
    { name: "lastNote", label: "Last note", type: "text" },
  ],
  listColumns: [
    { field: "id", label: "Refund", sortable: true },
    { field: "merchant", sortable: true },
    { field: "amountMinor", align: "right", sortable: true },
    { field: "reasonCode" },
    { field: "status", sortable: true },
    { field: "queue" },
    { field: "requestedAt", sortable: true },
  ],
  filters: [
    {
      field: "status",
      label: "Status",
      type: "enum",
      options: [
        { value: "requested", label: "Requested" },
        { value: "executing", label: "With processor" },
        { value: "settled", label: "Settled" },
        { value: "failed", label: "Failed" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    {
      field: "reasonCode",
      label: "Reason",
      type: "enum",
      options: [
        { value: "duplicate", label: "Duplicate" },
        { value: "not_received", label: "Not received" },
        { value: "faulty", label: "Faulty" },
        { value: "cancelled", label: "Cancelled" },
        { value: "goodwill", label: "Goodwill" },
        { value: "fraud", label: "Fraud" },
        { value: "partial_delivery", label: "Partially Delivered" },
      ],
    },
    {
      field: "queue",
      label: "Queue",
      type: "enum",
      options: [
        { value: "analyst", label: "Analyst" },
        { value: "manager", label: "Manager" },
      ],
    },
  ],
  stats: [
    {
      key: "requested",
      label: "Ready to send",
      roles: ["analyst"],
      source: { kind: "records", filters: { status: "requested", queue: "analyst" } },
    },
    {
      key: "with_manager",
      label: "With a manager",
      roles: ["analyst", "admin"],
      source: { kind: "records", filters: { queue: "manager" } },
    },
    {
      key: "manager_requested",
      label: "Need your approval",
      roles: ["manager"],
      source: { kind: "records", filters: { queue: "manager" } },
    },
    {
      key: "failed",
      label: "Failed",
      roles: ["analyst"],
      tone: "warning",
      source: { kind: "records", filters: { status: "failed", queue: "analyst" } },
    },
    {
      key: "manager_failed",
      label: "Failed",
      roles: ["manager"],
      tone: "warning",
      source: { kind: "records", filters: { status: "failed", queue: "manager" } },
    },
    {
      key: "executing",
      label: "With processor",
      roles: ["manager"],
      source: { kind: "records", filters: { status: "executing" } },
    },
    {
      key: "denied_24h",
      label: "Blocked in the last day",
      roles: ["admin"],
      tone: "warning",
      source: { kind: "audit", event: "denied", sinceHours: 24 },
    },
    {
      key: "policy_changes_7d",
      label: "Setting changes this week",
      roles: ["admin"],
      source: { kind: "audit", event: "constant_changed", sinceHours: 24 * 7 },
    },
  ],
  sections: [
    { title: "Payment", fields: ["paymentId", "merchant", "psp", "capturedMinor", "refundedMinor"] },
    { title: "Refund", fields: ["amountMinor", "currency", "usdMinor", "reasonCode", "disputed"] },
    { title: "Customer", fields: ["customerEmail", "cardLast4"] },
    { title: "Case", fields: ["requestedBy", "requestedAt", "settledAt", "lastNote"] },
  ],
  statuses: [
    { value: "requested", label: "Requested", tone: "info" },
    { value: "executing", label: "With processor", tone: "warning" },
    { value: "settled", label: "Settled", tone: "positive" },
    { value: "failed", label: "Failed", tone: "negative" },
    { value: "rejected", label: "Rejected", tone: "neutral" },
  ],
  statusField: "status",
  titleField: "id",
  revealRoles: rolesFor("refunds", "manager"),
  openStatuses: ["requested", "executing"],
  attention: (r) => (r.status === "failed" ? "failed" : null),
  constants: [
    {
      key: MANAGER_APPROVAL_USD_KEY,
      value: 50_000,
      type: "number",
      description: "Refunds at or above this amount need a manager. In cents, USD.",
      tool: "refunds",
    },
    {
      key: GOODWILL_APPROVAL_USD_KEY,
      value: 5_000,
      type: "number",
      description: "Goodwill refunds at or above this amount need a manager. In cents, USD.",
      tool: "refunds",
    },
    {
      key: CLUSTERING_WINDOW_DAYS_KEY,
      value: 0,
      type: "number",
      description:
        "Days of a merchant's \"not received\" refunds the refund hold adds up; once they reach the manager limit, the rest need a manager. 0 switches it off.",
      tool: "refunds",
    },
  ],
  actions: [
    defineAction<Refund, z.ZodObject<{ note: z.ZodOptional<z.ZodString> }>, Patch>({
      name: "execute",
      label: "Send to processor",
      description: "Release the refund to the payment processor.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: z.object({ note: z.string().max(500).optional() }),
      fromStatus: ["requested", "failed"],
      tone: "primary",
      routeToApprover: true,
      rules: [withinCapturedAmount, notDisputed, amountApproval, goodwillApproval, clusteringHold],
      suggest: () => ({ note: "Checks passed; sending to the processor." }),
      decide: ({ record, input }) => ({
        summary: `Send ${record?.id ?? ""} to processor: ${money(record?.amountMinor ?? 0, record?.currency ?? "USD")} to ${record?.merchant ?? ""}`,
        patch: { status: "executing", note: input.note ?? null },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<Refund, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "reject",
      label: "Reject",
      description: "Decline the refund without paying it.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["requested", "failed"],
      tone: "destructive",
      routeToApprover: true,
      rules: [paymentApprover],
      suggest: (record) => ({
        reason:
          record?.disputed === 1
            ? "Customer has an open chargeback on this payment."
            : record && record.refundedMinor + record.amountMinor > record.capturedMinor
              ? "Refund is more than what is left on the payment."
              : record?.reasonCode === "duplicate"
                ? "Duplicate of a refund already paid."
                : "Not eligible for a refund.",
      }),
      decide: ({ record, input }) => ({
        summary: `Reject ${record?.id ?? ""}: ${input.reason}`,
        patch: { status: "rejected", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<Refund, z.ZodObject<{ reference: z.ZodString }>, Patch>({
      name: "mark_settled",
      label: "Mark settled",
      description: "Record the processor confirmation and close the refund.",
      allowedRoles: rolesFor("refunds", "manager"),
      input: z.object({ reference: z.string().min(3).max(64) }),
      fromStatus: ["executing"],
      rules: [allow("settlement_is_a_record_keeping_step")],
      decide: ({ record, input }) => ({
        summary: `Mark ${record?.id ?? ""} settled (processor reference ${input.reference})`,
        patch: { status: "settled", note: `Processor reference ${input.reference}` },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<Refund, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "mark_failed",
      label: "Mark failed",
      description: "Record a processor rejection so the refund can be retried.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["executing"],
      rules: [allow("failure_is_a_record_keeping_step")],
      suggest: () => ({ reason: "Processor rejected the refund." }),
      decide: ({ record, input }) => ({
        summary: `${record?.id ?? ""} failed at the processor: ${input.reason}`,
        patch: { status: "failed", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
  ],
  ruleLabels: {
    within_captured_amount: "Within the amount paid",
    not_disputed: "No open chargeback",
    amount_approval: "Approval limit",
    goodwill_approval: "Goodwill limit",
    payment_approver: "Manager approval",
    clustering_hold: "Refund clustering hold",
    settlement_is_a_record_keeping_step: "Record-keeping step",
    failure_is_a_record_keeping_step: "Record-keeping step",
  },
  ruleFields: {
    within_captured_amount: ["amountMinor", "capturedMinor", "refundedMinor"],
    not_disputed: ["disputed"],
    amount_approval: ["amountMinor", "usdMinor"],
    goodwill_approval: ["reasonCode", "amountMinor"],
    clustering_hold: ["merchant", "reasonCode", "usdMinor"],
  },
  clusters: [
    {
      id: "merchant_not_received",
      label: "Refunds that add up past the manager limit",
      groups: () => notReceivedByMerchant(),
      traceAction: "execute",
      handoffSpec: "REFUND_CLUSTERING_HOLD.md",
    },
  ],
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses = [];
    if (filters.status) clauses.push(eq(refunds.status, filters.status));
    if (filters.reasonCode) clauses.push(eq(refunds.reasonCode, filters.reasonCode));
    if (search) {
      clauses.push(
        or(
          like(refunds.id, `%${search}%`),
          like(refunds.paymentId, `%${search}%`),
          like(refunds.merchant, `%${search}%`),
          inArray(refunds.id, search.split(",").map((s) => s.trim())),
        ),
      );
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const matchingRows = db
      .select()
      .from(refunds)
      .where(where)
      .orderBy(order(sort))
      .all();
    const withQueue = (record: Refund): Refund => ({ ...record, queue: queueOf(record) });
    if (filters.queue === "analyst" || filters.queue === "manager") {
      const queueRows = matchingRows.map(withQueue).filter((record) => record.queue === filters.queue);
      return { rows: queueRows.slice(offset, offset + limit), total: queueRows.length };
    }
    return {
      rows: matchingRows.slice(offset, offset + limit).map(withQueue),
      total: matchingRows.length,
    };
  },
  get: getRefund,
  seed: seedRefunds,
});

interface Patch {
  status: string;
  note: string | null;
}

function write(
  { tx, actor, record, now }: ApplyContext<Refund, unknown>,
  patch: Patch,
): ApplyResult<Refund> {
  if (!record) throw new Error("refund actions require a record");
  const settling = patch.status === "settled";
  tx.update(refunds)
    .set({
      status: patch.status,
      lastNote: patch.note,
      requestedBy: record.requestedBy ?? actor.id,
      // Money is only counted as refunded once the processor has confirmed it.
      refundedMinor: settling ? record.refundedMinor + record.amountMinor : record.refundedMinor,
      settledAt: settling ? now : record.settledAt,
      version: record.version + 1,
    })
    .where(and(eq(refunds.id, record.id), eq(refunds.version, record.version)))
    .run();
  const after = getRefund(record.id);
  if (!after) throw new Error(`refund ${record.id} vanished mid-apply`);
  return { recordId: record.id, before: record, after };
}

function getRefund(id: string): Refund | null {
  return db.select().from(refunds).where(eq(refunds.id, id)).get() ?? null;
}

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}
