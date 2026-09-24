import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@console/db";
import { defineAction, defineTool } from "@console/engine/declare";
import type {
  ApplyContext,
  ApplyResult,
  GovernedRecord,
  Rule,
  SortOption,
} from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { refunds } from "./schema";
import { seedRefunds } from "./seed";

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
}

export const MANAGER_APPROVAL_USD_KEY = "refunds.manager_approval_usd_minor";
export const ADMIN_APPROVAL_USD_KEY = "refunds.admin_approval_usd_minor";
export const GOODWILL_APPROVAL_USD_KEY = "refunds.goodwill_approval_usd_minor";

type RefundRule = Rule<Refund, unknown>;

/** A refund may never take the payment below zero, pending amounts included. */
const withinCapturedAmount: RefundRule = ({ record }) =>
  record && record.refundedMinor + record.amountMinor > record.capturedMinor
    ? {
        type: "deny",
        rule: "within_captured_amount",
        reason: `Refunding ${money(record.amountMinor, record.currency)} would exceed the ${money(record.capturedMinor - record.refundedMinor, record.currency)} still refundable`,
      }
    : { type: "allow", rule: "within_captured_amount" };

/** A disputed payment is the scheme's to settle; refunding it double-pays. */
const notDisputed: RefundRule = ({ record }) =>
  record && record.disputed === 1
    ? {
        type: "deny",
        rule: "not_disputed",
        reason: "A chargeback is open on this payment; resolve the dispute first",
      }
    : { type: "allow", rule: "not_disputed" };

const amountApproval: RefundRule = ({ record, constants }) => {
  const managerUsd = constants.number(MANAGER_APPROVAL_USD_KEY, 50_000);
  const adminUsd = constants.number(ADMIN_APPROVAL_USD_KEY, 500_000);
  const usd = record?.usdMinor ?? 0;
  if (usd >= adminUsd) {
    return {
      type: "require_approval",
      rule: "amount_approval",
      tier: "admin",
      allowedRoles: ["admin"],
      reason: `${money(usd, "USD")} is at or above the ${money(adminUsd, "USD")} admin threshold`,
    };
  }
  if (usd >= managerUsd) {
    return {
      type: "require_approval",
      rule: "amount_approval",
      tier: "manager",
      allowedRoles: rolesFor("refunds", "manager"),
      reason: `${money(usd, "USD")} is at or above the ${money(managerUsd, "USD")} manager threshold`,
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
        reason: `Goodwill refunds over ${money(limit, "USD")} need a manager`,
      }
    : { type: "allow", rule: "goodwill_approval" };
};

const allow =
  (rule: string): RefundRule =>
  () => ({ type: "allow", rule });

const SORTABLE = {
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
  description: "Refund requests against captured payments.",
  icon: "Undo2",
  group: "Money Movement",
  recordType: "refund",
  visibleTo: rolesFor("refunds", "agent"),
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
      help: "Frozen at request time; thresholds are evaluated against this.",
    },
    { name: "currency", label: "Currency", type: "string" },
    {
      name: "reasonCode",
      label: "Reason",
      type: "enum",
      enumValues: ["duplicate", "not_received", "faulty", "cancelled", "goodwill", "fraud"],
    },
    { name: "disputed", label: "Dispute open", type: "boolean" },
    { name: "requestedBy", label: "Requested by", type: "string" },
    { name: "requestedAt", label: "Requested", type: "date" },
    { name: "settledAt", label: "Settled", type: "date" },
    { name: "lastNote", label: "Last note", type: "text" },
  ],
  listColumns: [
    { field: "paymentId", sortable: true },
    { field: "merchant", sortable: true },
    { field: "amountMinor", align: "right", sortable: true },
    { field: "currency" },
    { field: "reasonCode" },
    { field: "status", sortable: true },
    { field: "requestedAt", sortable: true },
  ],
  filters: [
    {
      field: "status",
      label: "Status",
      type: "enum",
      options: [
        { value: "requested", label: "Requested" },
        { value: "executing", label: "Executing" },
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
      ],
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
    { value: "executing", label: "Executing", tone: "warning" },
    { value: "settled", label: "Settled", tone: "positive" },
    { value: "failed", label: "Failed", tone: "negative" },
    { value: "rejected", label: "Rejected", tone: "neutral" },
  ],
  statusField: "status",
  titleField: "paymentId",
  revealRoles: rolesFor("refunds", "manager"),
  constants: [
    {
      key: MANAGER_APPROVAL_USD_KEY,
      value: 50_000,
      type: "number",
      description: "USD minor units at which a refund needs a manager",
      tool: "refunds",
    },
    {
      key: ADMIN_APPROVAL_USD_KEY,
      value: 500_000,
      type: "number",
      description: "USD minor units at which a refund needs an admin",
      tool: "refunds",
    },
    {
      key: GOODWILL_APPROVAL_USD_KEY,
      value: 5_000,
      type: "number",
      description: "USD minor units at which a goodwill refund needs a manager",
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
      rules: [withinCapturedAmount, notDisputed, amountApproval, goodwillApproval],
      decide: ({ record, input }) => ({
        summary: `Refund ${money(record?.amountMinor ?? 0, record?.currency ?? "USD")} on ${record?.paymentId ?? ""}`,
        patch: { status: "executing", note: input.note ?? null },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<Refund, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "reject",
      label: "Reject request",
      description: "Decline the refund without paying it.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["requested", "failed"],
      tone: "destructive",
      rules: [allow("reject_always_permitted")],
      decide: ({ record, input }) => ({
        summary: `Reject refund on ${record?.paymentId ?? ""}: ${input.reason}`,
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
        summary: `Settle refund on ${record?.paymentId ?? ""} (${input.reference})`,
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
      decide: ({ record, input }) => ({
        summary: `Refund on ${record?.paymentId ?? ""} failed at the processor: ${input.reason}`,
        patch: { status: "failed", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
  ],
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses = [];
    if (filters.status) clauses.push(eq(refunds.status, filters.status));
    if (filters.reasonCode) clauses.push(eq(refunds.reasonCode, filters.reasonCode));
    if (search) {
      clauses.push(
        or(
          like(refunds.paymentId, `%${search}%`),
          like(refunds.merchant, `%${search}%`),
          eq(refunds.id, search),
        ),
      );
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const rows = db
      .select()
      .from(refunds)
      .where(where)
      .orderBy(order(sort))
      .limit(limit)
      .offset(offset)
      .all();
    const total = db.select({ id: refunds.id }).from(refunds).where(where).all().length;
    return { rows, total };
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
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
