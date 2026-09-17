import { and, eq, like, or, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { db } from "@/db/client";
import { defineAction, defineTool } from "@/engine/declare";
import type { GovernedRecord, Rule } from "@/engine/types";

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
        allowedRoles: ["manager", "admin"],
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
  visibleTo: ["analyst", "manager", "admin"],
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
  revealRoles: ["manager", "admin"],
  constants: [
    {
      key: APPROVAL_THRESHOLD_KEY,
      value: 50,
      type: "number",
      description: "Spends above this need a manager",
      tool: "widgets",
    },
  ],
  actions: [
    defineAction<Widget, z.ZodObject<{ amount: z.ZodNumber; reason: z.ZodString }>, { amount: number }>({
      name: "spend",
      label: "Spend",
      allowedRoles: ["analyst", "manager", "admin"],
      input: z.object({ amount: z.number().positive(), reason: z.string().min(1) }),
      fromStatus: ["open"],
      rules: [sufficientBalance, managerApprovalOverThreshold],
      decide: ({ record, input }) => ({
        summary: `Spend ${input.amount} from ${record?.name ?? "widget"}`,
        patch: { amount: input.amount },
      }),
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
      allowedRoles: ["manager", "admin"],
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
      name: "rename_unruled",
      label: "Rename (no rules)",
      allowedRoles: ["analyst", "manager", "admin"],
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
