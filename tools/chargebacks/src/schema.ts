import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Card disputes, one row per `Disputes` item in the Power Apps export.
 * `amountUsdMinor` is AmountUSD in cents; `openedAt` and `dueAt` are epoch
 * milliseconds; `evidenceUploaded` is 0 or 1.
 */
export const disputes = sqliteTable(
  "chargeback_disputes",
  {
    id: text("id").primaryKey(),
    cardNetwork: text("card_network").notNull(),
    reasonCode: text("reason_code").notNull(),
    reasonCategory: text("reason_category").notNull(),
    merchant: text("merchant").notNull(),
    amountUsdMinor: integer("amount_usd_minor").notNull(),
    openedAt: integer("opened_at").notNull(),
    dueAt: integer("due_at").notNull(),
    status: text("status").notNull(),
    evidenceUploaded: integer("evidence_uploaded").notNull(),
    notes: text("notes"),
    version: integer("version").notNull(),
  },
  (t) => [
    index("chargeback_disputes_status_idx").on(t.status),
    index("chargeback_disputes_due_idx").on(t.dueAt),
  ],
);
