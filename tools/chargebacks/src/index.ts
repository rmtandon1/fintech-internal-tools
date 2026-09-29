import { and, asc, desc, eq, gt, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
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

export interface Dispute extends GovernedRecord {
  id: string;
  cardNetwork: string;
  reasonCode: string;
  reasonCategory: string;
  merchant: string;
  usdMinor: number;
  openedAt: number;
  dueAt: number;
  status: string;
  evidenceUploaded: number;
  notes: string | null;
  version: number;
}

export const FRAUD_ACCEPT_APPROVAL_USD_KEY = "chargebacks.fraud_accept_approval_usd_minor";
export const FIGHT_APPROVAL_USD_KEY = "chargebacks.fight_approval_usd_minor";

export const DEFAULT_FRAUD_ACCEPT_APPROVAL_USD_MINOR = 50_000;
export const DEFAULT_FIGHT_APPROVAL_USD_MINOR = 250_000;

/** The export's deadline alert: open disputes over $1,000 due within 48 hours. */
export const DEADLINE_ALERT_USD_MINOR = 100_000;
export const DEADLINE_ALERT_HOURS = 48;

const HOUR = 60 * 60 * 1000;

/** The queue's open work, as the Power App's gallery shows it. */
export const OPEN_STATUSES = ["open", "evidence_requested", "fighting"];

/** The statuses the deadline alert looks at. */
const AWAITING_RESPONSE = ["open", "evidence_requested"];

const DECIDABLE = ["open", "evidence_requested"];

type DisputeRule = Rule<Dispute, unknown>;

/** Accepting a fraud dispute over the limit needs a refunds manager. */
const fraudAcceptApproval: DisputeRule = ({ record, constants }) => {
  const limit = constants.number(FRAUD_ACCEPT_APPROVAL_USD_KEY, DEFAULT_FRAUD_ACCEPT_APPROVAL_USD_MINOR);
  return record && record.reasonCategory === "fraud" && record.usdMinor > limit
    ? {
        type: "require_approval",
        rule: "fraud_accept_approval",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `Accepting a fraud dispute over ${usd(limit)} needs a refunds manager`,
      }
    : { type: "allow", rule: "fraud_accept_approval" };
};

/** Fighting a dispute over the limit needs a refunds manager. */
const fightApproval: DisputeRule = ({ record, constants }) => {
  const limit = constants.number(FIGHT_APPROVAL_USD_KEY, DEFAULT_FIGHT_APPROVAL_USD_MINOR);
  return record && record.usdMinor > limit
    ? {
        type: "require_approval",
        rule: "fight_approval",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `Fighting a dispute over ${usd(limit)} needs a refunds manager`,
      }
    : { type: "allow", rule: "fight_approval" };
};

const SORTABLE = {
  id: disputes.id,
  merchant: disputes.merchant,
  usdMinor: disputes.usdMinor,
  status: disputes.status,
  dueAt: disputes.dueAt,
  openedAt: disputes.openedAt,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return asc(disputes.dueAt);
  return sort?.direction === "asc" ? asc(column) : desc(column);
}

/** Open disputes over $1,000 whose deadline is still ahead and within 48 hours of `now`. */
function dueSoon(now: number): SQL | undefined {
  return and(
    inArray(disputes.status, AWAITING_RESPONSE),
    gt(disputes.usdMinor, DEADLINE_ALERT_USD_MINOR),
    gte(disputes.dueAt, now),
    lte(disputes.dueAt, now + DEADLINE_ALERT_HOURS * HOUR),
  );
}

const noteInput = z.object({ note: z.string().trim().min(3).max(500) });

export const chargebacksTool = defineTool<Dispute>({
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
      enumValues: ["visa", "mastercard", "amex"],
      enumLabels: { visa: "Visa", mastercard: "Mastercard", amex: "Amex" },
    },
    { name: "reasonCode", label: "Reason code", type: "string" },
    {
      name: "reasonCategory",
      label: "Reason",
      type: "enum",
      enumValues: ["fraud", "not_received", "not_as_described", "duplicate", "cancelled"],
    },
    { name: "merchant", label: "Merchant", type: "string" },
    { name: "usdMinor", label: "Amount", type: "currency", currency: "USD" },
    { name: "openedAt", label: "Opened", type: "date" },
    { name: "dueAt", label: "Response due", type: "date" },
    { name: "evidenceUploaded", label: "Evidence uploaded", type: "boolean" },
    { name: "notes", label: "Notes", type: "text" },
  ],
  listColumns: [
    { field: "id", label: "Dispute", sortable: true },
    { field: "merchant", sortable: true },
    { field: "reasonCategory" },
    { field: "usdMinor", align: "right", sortable: true },
    { field: "dueAt", label: "Deadline", sortable: true },
    { field: "status", sortable: true },
  ],
  filters: [
    {
      field: "status",
      label: "Status",
      type: "enum",
      options: [
        { value: "open", label: "Open" },
        { value: "evidence_requested", label: "Evidence requested" },
        { value: "fighting", label: "Fighting" },
        { value: "accepted", label: "Accepted" },
        { value: "won", label: "Won" },
        { value: "lost", label: "Lost" },
      ],
    },
    {
      field: "cardNetwork",
      label: "Card network",
      type: "enum",
      options: [
        { value: "visa", label: "Visa" },
        { value: "mastercard", label: "Mastercard" },
        { value: "amex", label: "Amex" },
      ],
    },
    {
      field: "reasonCategory",
      label: "Reason",
      type: "enum",
      options: [
        { value: "fraud", label: "Fraud" },
        { value: "not_received", label: "Not received" },
        { value: "not_as_described", label: "Not as described" },
        { value: "duplicate", label: "Duplicate" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      field: "dueSoon",
      label: "Deadline",
      type: "enum",
      options: [{ value: "yes", label: "Over $1,000, due within 48 hours" }],
    },
  ],
  stats: [
    {
      key: "due_within_48h",
      label: "Over $1,000, due within 48 hours",
      roles: ["refunds_agent", "refunds_manager", "admin"],
      tone: "warning",
      source: { kind: "records", filters: { dueSoon: "yes" } },
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
      roles: ["refunds_manager", "admin"],
      source: { kind: "approvals", scope: "decidable" },
    },
  ],
  sections: [
    { title: "Dispute", fields: ["cardNetwork", "reasonCode", "reasonCategory", "usdMinor"] },
    { title: "Merchant", fields: ["merchant", "evidenceUploaded"] },
    { title: "Deadline", fields: ["openedAt", "dueAt"] },
    { title: "Case", fields: ["notes"] },
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
  openStatuses: OPEN_STATUSES,
  attention: (d, now) =>
    AWAITING_RESPONSE.includes(d.status) &&
    d.dueAt >= now &&
    d.dueAt <= now + DEADLINE_ALERT_HOURS * HOUR
      ? "due within 48 hours"
      : null,
  constants: [
    {
      key: FRAUD_ACCEPT_APPROVAL_USD_KEY,
      value: DEFAULT_FRAUD_ACCEPT_APPROVAL_USD_MINOR,
      type: "number",
      description: "Accepting a fraud dispute over this amount needs a refunds manager. In cents, USD.",
      tool: "chargebacks",
    },
    {
      key: FIGHT_APPROVAL_USD_KEY,
      value: DEFAULT_FIGHT_APPROVAL_USD_MINOR,
      type: "number",
      description: "Fighting a dispute over this amount needs a refunds manager. In cents, USD.",
      tool: "chargebacks",
    },
  ],
  actions: [
    defineAction<Dispute, typeof noteInput, Patch>({
      name: "accept",
      label: "Accept",
      description: "Accept the chargeback and let the cardholder keep the refund.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: noteInput,
      fromStatus: DECIDABLE,
      rules: [fraudAcceptApproval],
      decide: ({ record, input }) => ({
        summary: `Accept ${record?.id ?? ""}: ${usd(record?.usdMinor ?? 0)} from ${record?.merchant ?? ""}`,
        patch: { status: "accepted", note: input.note },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<Dispute, typeof noteInput, Patch>({
      name: "fight",
      label: "Fight",
      description: "Represent the dispute to the card network.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: noteInput,
      fromStatus: DECIDABLE,
      rules: [fightApproval],
      decide: ({ record, input }) => ({
        summary: `Fight ${record?.id ?? ""}: ${usd(record?.usdMinor ?? 0)} from ${record?.merchant ?? ""}`,
        patch: { status: "fighting", note: input.note },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
  ],
  ruleLabels: {
    fraud_accept_approval: "Fraud accept limit",
    fight_approval: "Fight limit",
  },
  ruleFields: {
    fraud_accept_approval: ["reasonCategory", "usdMinor"],
    fight_approval: ["usdMinor"],
  },
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses: (SQL | undefined)[] = [];
    clauses.push(
      filters.status
        ? eq(disputes.status, filters.status)
        : inArray(disputes.status, OPEN_STATUSES),
    );
    if (filters.cardNetwork) clauses.push(eq(disputes.cardNetwork, filters.cardNetwork));
    if (filters.reasonCategory) clauses.push(eq(disputes.reasonCategory, filters.reasonCategory));
    if (filters.dueSoon === "yes") clauses.push(dueSoon(Date.now()));
    if (search) {
      clauses.push(
        or(
          like(disputes.id, `%${search}%`),
          like(disputes.merchant, `%${search}%`),
          inArray(disputes.id, search.split(",").map((s) => s.trim())),
        ),
      );
    }
    const where = and(...clauses);
    const rows = db
      .select()
      .from(disputes)
      .where(where)
      .orderBy(order(sort), asc(disputes.id))
      .limit(limit)
      .offset(offset)
      .all();
    const total = db.select({ id: disputes.id }).from(disputes).where(where).all().length;
    return { rows, total };
  },
  get: getDispute,
  seed: seedDisputes,
});

interface Patch {
  status: string;
  note: string;
}

function write(
  { tx, record }: ApplyContext<Dispute, unknown>,
  patch: Patch,
): ApplyResult<Dispute> {
  if (!record) throw new Error("dispute actions require a record");
  tx.update(disputes)
    .set({ status: patch.status, notes: patch.note, version: record.version + 1 })
    .where(and(eq(disputes.id, record.id), eq(disputes.version, record.version)))
    .run();
  const after = getDispute(record.id);
  if (!after) throw new Error(`dispute ${record.id} vanished mid-apply`);
  return { recordId: record.id, before: record, after };
}

function getDispute(id: string): Dispute | null {
  return db.select().from(disputes).where(eq(disputes.id, id)).get() ?? null;
}

function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}
