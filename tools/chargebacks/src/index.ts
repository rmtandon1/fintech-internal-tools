import { and, asc, desc, eq, gt, inArray, like, lte, or } from "drizzle-orm";
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
import { chargebacks } from "./schema";
import { seedChargebacks } from "./seed";

export { EXPORT_SNAPSHOT, EXPORTED_DISPUTES, type ExportedDispute } from "./disputes";

export interface Chargeback extends GovernedRecord {
  id: string;
  cardNetwork: string;
  reasonCode: string;
  reasonCategory: string;
  merchant: string;
  amountMinor: number;
  openedAt: number;
  dueAt: number;
  status: string;
  evidenceUploaded: number;
  notes: string | null;
  decidedBy: string | null;
  version: number;
}

export const FRAUD_ACCEPT_APPROVAL_USD_KEY = "chargebacks.fraud_accept_approval_usd_minor";
export const FIGHT_APPROVAL_USD_KEY = "chargebacks.fight_approval_usd_minor";

/** The Power App's alert: open disputes over $1,000 due within 48 hours. */
export const DEADLINE_ALERT_USD_MINOR = 100_000;
export const DEADLINE_ALERT_HOURS = 48;
const HOUR = 60 * 60 * 1000;

/** Statuses the Power App's queue shows: work still to decide or in flight. */
export const OPEN_WORK = ["open", "evidence_requested", "fighting"];
const DECIDABLE = ["open", "evidence_requested"];

type ChargebackRule = Rule<Chargeback, unknown>;

/** Accepting a fraud dispute concedes the money; above the limit a manager signs. */
const fraudAcceptApproval: ChargebackRule = ({ record, constants }) => {
  const limit = constants.number(FRAUD_ACCEPT_APPROVAL_USD_KEY, 50_000);
  return record && record.reasonCategory === "fraud" && record.amountMinor > limit
    ? {
        type: "require_approval",
        rule: "fraud_accept_approval",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `Accepting a fraud dispute over ${usd(limit)} needs a refunds manager`,
      }
    : { type: "allow", rule: "fraud_accept_approval" };
};

/** Fighting a large dispute risks the network fee on top of the amount. */
const fightApproval: ChargebackRule = ({ record, constants }) => {
  const limit = constants.number(FIGHT_APPROVAL_USD_KEY, 250_000);
  return record && record.amountMinor > limit
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
  id: chargebacks.id,
  merchant: chargebacks.merchant,
  amountMinor: chargebacks.amountMinor,
  status: chargebacks.status,
  dueAt: chargebacks.dueAt,
  openedAt: chargebacks.openedAt,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return asc(chargebacks.dueAt);
  return sort?.direction === "asc" ? asc(column) : desc(column);
}

const noteInput = z.object({ note: z.string().trim().min(1).max(500) });

export const chargebackTool = defineTool<Chargeback>({
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
    { name: "amountMinor", label: "Amount", type: "currency", currency: "USD" },
    { name: "openedAt", label: "Opened", type: "date" },
    { name: "dueAt", label: "Deadline", type: "date" },
    { name: "evidenceUploaded", label: "Evidence uploaded", type: "boolean" },
    { name: "notes", label: "Notes", type: "text" },
    { name: "decidedBy", label: "Decided by", type: "string" },
  ],
  listColumns: [
    { field: "id", label: "Dispute", sortable: true },
    { field: "merchant", sortable: true },
    { field: "reasonCategory" },
    { field: "amountMinor", align: "right", sortable: true },
    { field: "status", sortable: true },
    { field: "dueAt", sortable: true },
  ],
  filters: [
    {
      field: "queue",
      label: "Show",
      type: "enum",
      options: [{ value: "open_work", label: "Open work" }],
    },
    {
      field: "deadline",
      label: "Deadline",
      type: "enum",
      options: [{ value: "due_48h", label: "Over $1,000, due within 48 hours" }],
    },
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
  ],
  stats: [
    {
      key: "due_48h",
      label: "Over $1,000, due within 48 hours",
      roles: rolesFor("refunds", "agent"),
      tone: "warning",
      source: { kind: "records", filters: { deadline: "due_48h" } },
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
    {
      title: "Dispute",
      fields: ["cardNetwork", "reasonCode", "reasonCategory", "merchant", "amountMinor"],
    },
    { title: "Deadline", fields: ["openedAt", "dueAt", "evidenceUploaded"] },
    { title: "Case", fields: ["notes", "decidedBy"] },
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
  openStatuses: OPEN_WORK,
  attention: (r, now) => (isDeadlineAlert(r, now) ? "due soon" : null),
  constants: [
    {
      key: FRAUD_ACCEPT_APPROVAL_USD_KEY,
      value: 50_000,
      type: "number",
      description:
        "Accepting a fraud dispute over this amount needs a refunds manager. In cents, USD.",
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
    defineAction<Chargeback, typeof noteInput, Patch>({
      name: "accept",
      label: "Accept",
      description: "Concede the dispute and let the cardholder keep the money.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: noteInput,
      fromStatus: DECIDABLE,
      tone: "destructive",
      rules: [fraudAcceptApproval],
      decide: ({ record, input }) => ({
        summary: `Accept ${record?.id ?? ""}: ${usd(record?.amountMinor ?? 0)} ${record?.reasonCategory ?? ""} dispute from ${record?.merchant ?? ""}`,
        patch: { status: "accepted", note: input.note },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<Chargeback, typeof noteInput, Patch>({
      name: "fight",
      label: "Fight",
      description: "Represent the dispute to the card network.",
      allowedRoles: rolesFor("refunds", "agent"),
      input: noteInput,
      fromStatus: DECIDABLE,
      tone: "primary",
      rules: [fightApproval],
      decide: ({ record, input }) => ({
        summary: `Fight ${record?.id ?? ""}: ${usd(record?.amountMinor ?? 0)} dispute from ${record?.merchant ?? ""}`,
        patch: { status: "fighting", note: input.note },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
  ],
  ruleLabels: {
    fraud_accept_approval: "Fraud accept limit",
    fight_approval: "Fight approval limit",
  },
  ruleFields: {
    fraud_accept_approval: ["reasonCategory", "amountMinor"],
    fight_approval: ["amountMinor"],
  },
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses = [];
    if (filters.queue === "open_work") clauses.push(inArray(chargebacks.status, OPEN_WORK));
    if (filters.deadline === "due_48h") {
      clauses.push(
        eq(chargebacks.status, "open"),
        gt(chargebacks.amountMinor, DEADLINE_ALERT_USD_MINOR),
        lte(chargebacks.dueAt, Date.now() + DEADLINE_ALERT_HOURS * HOUR),
      );
    }
    if (filters.status) clauses.push(eq(chargebacks.status, filters.status));
    if (filters.cardNetwork) clauses.push(eq(chargebacks.cardNetwork, filters.cardNetwork));
    if (search) {
      clauses.push(
        or(
          like(chargebacks.id, `%${search}%`),
          like(chargebacks.merchant, `%${search}%`),
          like(chargebacks.reasonCode, `%${search}%`),
        ),
      );
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const rows = db
      .select()
      .from(chargebacks)
      .where(where)
      .orderBy(order(sort), asc(chargebacks.id))
      .limit(limit)
      .offset(offset)
      .all();
    const total = db.select({ id: chargebacks.id }).from(chargebacks).where(where).all().length;
    return { rows, total };
  },
  get: getChargeback,
  seed: () => seedChargebacks(),
});

/** The deadline alert's condition, as the Power App's banner and flow test it. */
export function isDeadlineAlert(record: Chargeback, now: number): boolean {
  return (
    record.status === "open" &&
    record.amountMinor > DEADLINE_ALERT_USD_MINOR &&
    record.dueAt <= now + DEADLINE_ALERT_HOURS * HOUR
  );
}

interface Patch {
  status: string;
  note: string;
}

function write(
  { tx, actor, record }: ApplyContext<Chargeback, unknown>,
  patch: Patch,
): ApplyResult<Chargeback> {
  if (!record) throw new Error("chargeback actions require a record");
  tx.update(chargebacks)
    .set({
      status: patch.status,
      notes: patch.note,
      decidedBy: actor.id,
      version: record.version + 1,
    })
    .where(and(eq(chargebacks.id, record.id), eq(chargebacks.version, record.version)))
    .run();
  const after = getChargeback(record.id);
  if (!after) throw new Error(`chargeback ${record.id} vanished mid-apply`);
  return { recordId: record.id, before: record, after };
}

function getChargeback(id: string): Chargeback | null {
  return db.select().from(chargebacks).where(eq(chargebacks.id, id)).get() ?? null;
}

function usd(minor: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);
}
