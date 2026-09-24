import { and, eq, like, or, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { db } from "@console/db";
import { defineAction, defineTool } from "@console/engine/declare";
import type { GovernedRecord, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";

/**
 * A stand-in governed tool. It exercises the engine exactly as a real tool
 * does — declaration, rules, decide, apply — without any test depending on
 * the behaviour of a shipped tool.
 */
export const widgets = sqliteTable("widgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  balance: integer("balance").notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull(),
});

export const WIDGETS_DDL = `
  CREATE TABLE IF NOT EXISTS widgets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    balance INTEGER NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL
  );
`;

export interface Widget extends GovernedRecord {
  id: string;
  name: string;
  ownerEmail: string;
  balance: number;
  status: string;
  version: number;
}

export const APPROVAL_THRESHOLD_KEY = "widgets.approval_threshold";
export const SPEND_FEE_KEY = "widgets.spend_fee";

const sufficientBalance: Rule<Widget, { amount: number }> = ({ record, input }) =>
  record && input.amount > record.balance
    ? {
        type: "deny",
        rule: "sufficient_balance",
        reason: `Only ${record?.balance} available`,
      }
    : { type: "allow", rule: "sufficient_balance" };

const managerApprovalOverThreshold: Rule<Widget, { amount: number }> = ({
  input,
  constants,
}) => {
  const threshold = constants.number(APPROVAL_THRESHOLD_KEY, 50);
  return input.amount > threshold
    ? {
        type: "require_approval",
        rule: "manager_approval_over_threshold",
        tier: "manager",
        allowedRoles: rolesFor("kyc", "manager"),
        reason: `Amount ${input.amount} is over the ${threshold} threshold`,
      }
    : { type: "allow", rule: "manager_approval_over_threshold" };
};

export const widgetTool = defineTool<Widget>({
  name: "widgets",
  displayName: "Widgets",
  description: "Fixture tool used by the engine tests.",
  icon: "Box",
  group: "Test",
  recordType: "widget",
  visibleTo: rolesFor("kyc", "agent"),
  fields: [
    { name: "name", label: "Name", type: "string" },
    { name: "ownerEmail", label: "Owner email", type: "string", isPII: true },
    { name: "balance", label: "Balance", type: "number" },
    { name: "status", label: "Status", type: "enum", enumValues: ["open", "closed"] },
  ],
  listColumns: [{ field: "name" }, { field: "balance" }, { field: "status" }],
  filters: [],
  sections: [{ title: "Widget", fields: ["name", "ownerEmail", "balance"] }],
  statuses: [
    { value: "open", label: "Open", tone: "info" },
    { value: "closed", label: "Closed", tone: "neutral" },
  ],
  statusField: "status",
  titleField: "name",
  revealRoles: rolesFor("kyc", "manager"),
  constants: [
    {
      key: APPROVAL_THRESHOLD_KEY,
      value: 50,
      type: "number",
      description: "Spends above this need a manager",
      tool: "widgets",
    },
    {
      key: SPEND_FEE_KEY,
      value: 0,
      type: "number",
      description: "Fee added to every spend when it is decided",
      tool: "widgets",
    },
  ],
  actions: [
    defineAction<Widget, z.ZodObject<{ amount: z.ZodNumber; reason: z.ZodString }>, { amount: number }>({
      name: "spend",
      label: "Spend",
      allowedRoles: rolesFor("kyc", "agent"),
      input: z.object({ amount: z.number().positive(), reason: z.string().min(1) }),
      fromStatus: ["open"],
      rules: [sufficientBalance, managerApprovalOverThreshold],
      // Deliberately constant-dependent: proves the approval path replays the
      // decision frozen at request time rather than recomputing it.
      decide: ({ record, input, constants }) => {
        const amount = input.amount + constants.number(SPEND_FEE_KEY, 0);
        return {
          summary: `Spend ${amount} from ${record?.name ?? "widget"}`,
          patch: { amount },
        };
      },
      apply: ({ tx, record }, decision) => {
        if (!record) throw new Error("spend requires a record");
        tx.update(widgets)
          .set({
            balance: sql`${widgets.balance} - ${decision.patch.amount}`,
            version: record.version + 1,
          })
          .where(and(eq(widgets.id, record.id), eq(widgets.version, record.version)))
          .run();
        const after = get(record.id);
        if (!after) throw new Error("widget vanished mid-apply");
        return { recordId: record.id, before: record, after };
      },
    }),
    defineAction<Widget, z.ZodObject<Record<string, never>>, null>({
      name: "close",
      label: "Close",
      allowedRoles: rolesFor("kyc", "manager"),
      input: z.object({}),
      fromStatus: ["open"],
      rules: [() => ({ type: "allow", rule: "always" })],
      decide: ({ record }) => ({
        summary: `Close ${record?.name ?? "widget"}`,
        patch: null,
      }),
      apply: ({ tx, record }) => {
        if (!record) throw new Error("close requires a record");
        tx.update(widgets)
          .set({ status: "closed", version: record.version + 1 })
          .where(eq(widgets.id, record.id))
          .run();
        const after = get(record.id);
        if (!after) throw new Error("widget vanished mid-apply");
        return { recordId: record.id, before: record, after };
      },
    }),
    defineAction<Widget, z.ZodObject<Record<string, never>>, null>({
      name: "explode",
      label: "Explode",
      allowedRoles: rolesFor("kyc", "agent"),
      input: z.object({}),
      fromStatus: ["open"],
      rules: [
        () => ({
          type: "require_approval",
          rule: "always_approval",
          tier: "manager",
          allowedRoles: rolesFor("kyc", "manager"),
          reason: "fixture action always needs approval",
        }),
      ],
      decide: ({ record }) => ({ summary: `Explode ${record?.id}`, patch: null }),
      apply: ({ tx, record }) => {
        if (!record) throw new Error("explode requires a record");
        tx.update(widgets)
          .set({ balance: 0, version: record.version + 1 })
          .where(eq(widgets.id, record.id))
          .run();
        throw new Error("apply blew up after writing");
      },
    }),
    defineAction<Widget, z.ZodObject<Record<string, never>>, null>({
      name: "explode_now",
      label: "Explode immediately",
      allowedRoles: rolesFor("kyc", "agent"),
      input: z.object({}),
      fromStatus: ["open"],
      rules: [() => ({ type: "allow", rule: "always" })],
      decide: ({ record }) => ({ summary: `Explode ${record?.id}`, patch: null }),
      apply: ({ tx, record }) => {
        if (!record) throw new Error("explode requires a record");
        tx.update(widgets)
          .set({ balance: 0, version: record.version + 1 })
          .where(eq(widgets.id, record.id))
          .run();
        throw new Error("apply blew up after writing");
      },
    }),
    defineAction<Widget, z.ZodObject<Record<string, never>>, null>({
      name: "rename_unruled",
      label: "Rename (no rules)",
      allowedRoles: rolesFor("kyc", "agent"),
      input: z.object({}),
      rules: [],
      decide: () => ({ summary: "Rename", patch: null }),
      apply: ({ record }) => {
        if (!record) throw new Error("unreachable: default deny");
        return { recordId: record.id, before: record, after: record };
      },
    }),
  ],
  list: ({ filters, search, limit, offset }) => {
    const clauses = [];
    if (filters.status) clauses.push(eq(widgets.status, filters.status));
    if (search) {
      clauses.push(or(like(widgets.name, `%${search}%`), eq(widgets.id, search)));
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const rows = db.select().from(widgets).where(where).limit(limit).offset(offset).all();
    return { rows, total: rows.length };
  },
  get,
});

function get(id: string): Widget | null {
  return db.select().from(widgets).where(eq(widgets.id, id)).get() ?? null;
}

/**
 * A tool only admins can see, whose action and reveal roles nevertheless
 * name the reviewer. Visibility must win in both places.
 */
export const vaultTool = defineTool<Widget>({
  name: "vault",
  displayName: "Vault",
  description: "Admin-only fixture tool.",
  icon: "Lock",
  group: "Test",
  recordType: "vault_item",
  visibleTo: ["admin"],
  fields: [
    { name: "name", label: "Name", type: "string" },
    { name: "ownerEmail", label: "Owner email", type: "string", isPII: true },
  ],
  listColumns: [{ field: "name" }],
  filters: [],
  sections: [{ title: "Item", fields: ["name", "ownerEmail"] }],
  statuses: [{ value: "open", label: "Open", tone: "info" }],
  statusField: "status",
  titleField: "name",
  revealRoles: ["kyc_reviewer", "admin"],
  actions: [
    defineAction<Widget, z.ZodObject<Record<string, never>>, null>({
      name: "close",
      label: "Close",
      allowedRoles: ["kyc_reviewer", "admin"],
      input: z.object({}),
      fromStatus: ["open"],
      rules: [() => ({ type: "allow", rule: "always" })],
      decide: ({ record }) => ({ summary: `Close ${record?.id}`, patch: null }),
      apply: ({ tx, record }) => {
        if (!record) throw new Error("close requires a record");
        tx.update(widgets)
          .set({ status: "closed", version: record.version + 1 })
          .where(eq(widgets.id, record.id))
          .run();
        const after = get(record.id);
        if (!after) throw new Error("item vanished mid-apply");
        return { recordId: record.id, before: record, after };
      },
    }),
  ],
  list: ({ limit, offset }) => {
    const rows = db.select().from(widgets).limit(limit).offset(offset).all();
    return { rows, total: rows.length };
  },
  get,
});
