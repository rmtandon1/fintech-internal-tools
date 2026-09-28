import { and, asc, desc, eq, gt, like, lte, or } from "drizzle-orm";
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
import { disputes } from "./schema";
import { seedDisputes } from "./seed";

export { DISPUTES, EXPORT_AT, seedDisputes } from "./seed";

export interface Dispute extends GovernedRecord {
  id: string;
  cardNetwork: string;
  reasonCode: string;
  reasonCategory: string;
  merchant: string;
  amountUsdMinor: number;
  openedAt: number;
  dueAt: number;
  status: string;
  evidenceUploaded: number;
  notes: string | null;
  version: number;
}

export const FRAUD_ACCEPT_APPROVAL_USD_KEY = "chargebacks.fraud_accept_approval_usd_minor";
export const FIGHT_APPROVAL_USD_KEY = "chargebacks.fight_approval_usd_minor";

/** The deadline alert: open disputes over $1,000 due within 48 hours. */
export const DUE_SOON_USD_MINOR = 100_000;
export const DUE_SOON_HOURS = 48;
export const DUE_SOON_FILTER = "over_1000_48h";

const HOUR = 60 * 60 * 1000;

type DisputeRule = Rule<Dispute, unknown>;

/** Accepting a fraud dispute refunds the cardholder, so large ones need a manager. */
const fraudAcceptApproval: DisputeRule = ({ record, constants }) => {
  const limit = constants.number(FRAUD_ACCEPT_APPROVAL_USD_KEY, 50_000);
  return record && record.reasonCategory === "fraud" && record.amountUsdMinor > limit
    ? {
        type: "require_approval",
        rule: "fraud_accept_approval",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `Accepting a fraud dispute over ${money(limit)} needs a refunds manager`,
      }
    : { type: "allow", rule: "fraud_accept_approval" };
};

/** A lost fight costs the amount plus the network fee, so large ones need a manager. */
const fightApproval: DisputeRule = ({ record, constants }) => {
  const limit = constants.number(FIGHT_APPROVAL_USD_KEY, 250_000);
  return record && record.amountUsdMinor > limit
    ? {
        type: "require_approval",
        rule: "fight_approval",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `Fighting a dispute over ${money(limit)} needs a refunds manager`,
      }
    : { type: "allow", rule: "fight_approval" };
};

const SORTABLE = {
  id: disputes.id,
  merchant: disputes.merchant,
  amountUsdMinor: disputes.amountUsdMinor,
  dueAt: disputes.dueAt,
  status: disputes.status,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return asc(disputes.dueAt);
  return sort?.direction === "asc" ? asc(column) : desc(column);
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "evidence_requested", label: "Evidence requested" },
  { value: "fighting", label: "Fighting" },
  { value: "accepted", label: "Accepted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

const NETWORK_OPTIONS = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "Amex" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "fraud", label: "Fraud" },
  { value: "not_received", label: "Not received" },
  { value: "not_as_described", label: "Not as described" },
  { value: "duplicate", label: "Duplicate" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const labels = (options: readonly { value: string; label: string }[]) =>
  Object.fromEntries(options.map((o) => [o.value, o.label]));

const noteInput = z.object({ note: z.string().trim().min(1).max(1000) });
type NoteInput = typeof noteInput;

export const chargebackTool = defineTool<Dispute>({
  name: "chargebacks",
  displayName: "Chargebacks",
  description: "Accept or fight card disputes before the deadline.",
  icon: "Gavel",
  group: "Money Movement",
  recordType: "dispute",
  visibleTo: rolesFor("refunds", "agent"),
  fields: [
    {
      name: "cardNetwork",
      label: "Card network",
      type: "enum",
      enumValues: NETWORK_OPTIONS.map((o) => o.value),
      enumLabels: labels(NETWORK_OPTIONS),
    },
    { name: "reasonCode", label: "Reason code", type: "string" },
    {
      name: "reasonCategory",
      label: "Reason",
      type: "enum",
      enumValues: CATEGORY_OPTIONS.map((o) => o.value),
      enumLabels: labels(CATEGORY_OPTIONS),
    },
    { name: "merchant", label: "Merchant", type: "string" },
    { name: "amountUsdMinor", label: "Amount", type: "currency", currency: "USD" },
    { name: "openedAt", label: "Opened", type: "date" },
    { name: "dueAt", label: "Deadline", type: "date" },
    { name: "evidenceUploaded", label: "Evidence uploaded", type: "boolean" },
    { name: "notes", label: "Notes", type: "text" },
  ],
  listColumns: [
    { field: "id", label: "Dispute", sortable: true },
    { field: "merchant", sortable: true },
    { field: "reasonCategory" },
    { field: "amountUsdMinor", align: "right", sortable: true },
    { field: "dueAt", sortable: true },
    { field: "status", sortable: true },
  ],
  filters: [
    { field: "status", label: "Status", type: "enum", options: STATUS_OPTIONS },
    { field: "cardNetwork", label: "Network", type: "enum", options: NETWORK_OPTIONS },
    {
      field: "due",
      label: "Deadline",
      type: "enum",
      options: [{ value: DUE_SOON_FILTER, label: "Over $1,000, due within 48 hours" }],
    },
  ],
  stats: [
    {
      key: "due_soon",
      label: "Over $1,000, due within 48 hours",
      roles: rolesFor("refunds", "agent"),
      tone: "warning",
      source: { kind: "records", filters: { due: DUE_SOON_FILTER } },
    },
    {
      key: "open",
      label: "Open",
      roles: rolesFor("refunds", "agent"),
      source: { kind: "records", filters: { status: "open" } },
    },
    {
      key: "my_requests_awaiting",
      label: "Waiting on approval",
      roles: ["refunds_agent"],
      source: { kind: "approvals", scope: "requested_by_me" },
    },
    {
      key: "awaiting_approval",
      label: "Need your approval",
      roles: rolesFor("refunds", "manager"),
      source: { kind: "approvals", scope: "decidable" },
    },
  ],
  sections: [
    { title: "Dispute", fields: ["cardNetwork", "reasonCode", "reasonCategory", "merchant", "amountUsdMinor"] },
    { title: "Dates", fields: ["openedAt", "dueAt"] },
    { title: "Case", fields: ["evidenceUploaded", "notes"] },
  ],
  statuses: [
    { value: "open", label: "Open", tone: "info" },
    { value: "evidence_requested", label: "Evidence requested", tone: "warning" },
    { value: "fighting", label: "Fighting", tone: "warning" },
    { value: "accepted", label: "Accepted", tone: "neutral" },
    { value: "won", label: "Won", tone: "positive" },
    { value: "lost", label: "Lost", tone: "negative" },
  ],
  statusField: "status",
  titleField: "id",
  revealRoles: rolesFor("refunds", "manager"),
  openStatuses: ["open", "evidence_requested", "fighting"],
  attention: (r, now) => {
    if (!["open", "evidence_requested", "fighting"].includes(r.status)) return null;
    if (r.dueAt < now) return "overdue";
    return r.dueAt <= now + DUE_SOON_HOURS * HOUR ? "due soon" : null;
  },
  constants: [
    {
      key: FRAUD_ACCEPT_APPROVAL_USD_KEY,
      value: 50_000,
      type: "number",
      description: "Accepting a fraud dispute over this amount needs a refunds manager. In cents, USD.",
      tool: "chargebacks",
    },
    {
      key: FIGHT_APPROVAL_USD_KEY,
      value: 250_000,
      type: "number",
      description: "Fighting a dispute over this amount needs a refunds manager. In cents, USD.",
      tool: "chargebacks",
    },
  ],
  actions: [
    defineAction<Dispute, NoteInput, Patch>({
      name: "accept",
      label: "Accept",
      description: "Accept the dispute and let the cardholder keep the money.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: noteInput,
      fromStatus: ["open", "evidence_requested", "fighting"],
      tone: "destructive",
      rules: [fraudAcceptApproval],
      decide: ({ record, input }) => ({
        summary: `Accept ${record?.id ?? ""}: ${money(record?.amountUsdMinor ?? 0)} to the cardholder of ${record?.merchant ?? ""}`,
        patch: { status: "accepted", notes: input.note },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<Dispute, NoteInput, Patch>({
      name: "fight",
      label: "Fight",
      description: "Represent the dispute to the card network.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: noteInput,
      fromStatus: ["open", "evidence_requested"],
      tone: "primary",
      rules: [fightApproval],
      decide: ({ record, input }) => ({
        summary: `Fight ${record?.id ?? ""}: ${money(record?.amountUsdMinor ?? 0)} with ${record?.merchant ?? ""}`,
        patch: { status: "fighting", notes: input.note },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
  ],
  ruleLabels: {
    fraud_accept_approval: "Fraud accept limit",
    fight_approval: "Fight limit",
  },
  ruleFields: {
    fraud_accept_approval: ["reasonCategory", "amountUsdMinor"],
    fight_approval: ["amountUsdMinor"],
  },
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses = [];
    if (filters.status) clauses.push(eq(disputes.status, filters.status));
    if (filters.cardNetwork) clauses.push(eq(disputes.cardNetwork, filters.cardNetwork));
    if (filters.due === DUE_SOON_FILTER) {
      clauses.push(
        eq(disputes.status, "open"),
        gt(disputes.amountUsdMinor, DUE_SOON_USD_MINOR),
        lte(disputes.dueAt, Date.now() + DUE_SOON_HOURS * HOUR),
      );
    }
    if (search) {
      clauses.push(or(like(disputes.id, `%${search}%`), like(disputes.merchant, `%${search}%`)));
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const rows = db
      .select()
      .from(disputes)
      .where(where)
      .orderBy(order(sort))
      .limit(limit)
      .offset(offset)
      .all();
    const total = db.select({ id: disputes.id }).from(disputes).where(where).all().length;
    return { rows, total };
  },
  get: getDispute,
  seed: () => seedDisputes(),
});

interface Patch {
  status: string;
  notes: string;
}

function write(
  { tx, record }: ApplyContext<Dispute, unknown>,
  patch: Patch,
): ApplyResult<Dispute> {
  if (!record) throw new Error("dispute actions require a record");
  tx.update(disputes)
    .set({ status: patch.status, notes: patch.notes, version: record.version + 1 })
    .where(and(eq(disputes.id, record.id), eq(disputes.version, record.version)))
    .run();
  const after = getDispute(record.id);
  if (!after) throw new Error(`dispute ${record.id} vanished mid-apply`);
  return { recordId: record.id, before: record, after };
}

function getDispute(id: string): Dispute | null {
  return db.select().from(disputes).where(eq(disputes.id, id)).get() ?? null;
}

function money(minor: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);
}
