import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Card disputes moved from the Chargebacks Power App's `Disputes` SharePoint
 * list. The id is the list's `DisputeId`; amounts are USD cents and dates are
 * epoch milliseconds.
 */
export const disputes = sqliteTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    cardNetwork: text("card_network").notNull(),
    reasonCode: text("reason_code").notNull(),
    reasonCategory: text("reason_category").notNull(),
    merchant: text("merchant").notNull(),
    usdMinor: integer("usd_minor").notNull(),
    openedAt: integer("opened_at").notNull(),
    dueAt: integer("due_at").notNull(),
    status: text("status").notNull(),
    evidenceUploaded: integer("evidence_uploaded").notNull(),
    notes: text("notes"),
    version: integer("version").notNull(),
  },
  (t) => [index("disputes_status_idx").on(t.status), index("disputes_due_idx").on(t.dueAt)],
);
