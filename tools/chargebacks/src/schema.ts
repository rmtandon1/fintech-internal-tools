import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Card disputes, one row per Power Apps `Disputes` item. `id` is the export's
 * DisputeId; `amountMinor` is AmountUSD in integer cents; times are epoch ms.
 */
export const chargebacks = sqliteTable(
  "chargebacks",
  {
    id: text("id").primaryKey(),
    cardNetwork: text("card_network").notNull(),
    reasonCode: text("reason_code").notNull(),
    reasonCategory: text("reason_category").notNull(),
    merchant: text("merchant").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    openedAt: integer("opened_at").notNull(),
    dueAt: integer("due_at").notNull(),
    status: text("status").notNull(),
    evidenceUploaded: integer("evidence_uploaded").notNull(),
    notes: text("notes"),
    decidedBy: text("decided_by"),
    version: integer("version").notNull(),
  },
  (t) => [
    index("chargebacks_status_idx").on(t.status),
    index("chargebacks_due_idx").on(t.dueAt),
  ],
);
