import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Refunds against captured payments. Amounts are integer minor units in the
 * payment's own currency; `usdMinor` is the reference amount policy compares
 * against, frozen at capture time so a rate move cannot change a threshold.
 */
export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id").notNull(),
    customerEmail: text("customer_email").notNull(),
    cardLast4: text("card_last4").notNull(),
    merchant: text("merchant").notNull(),
    /** The merchant's KYC case; the link refund rules read, never the merchant name. */
    merchantCaseId: text("merchant_case_id"),
    psp: text("psp").notNull(),
    currency: text("currency").notNull(),
    capturedMinor: integer("captured_minor").notNull(),
    refundedMinor: integer("refunded_minor").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    usdMinor: integer("usd_minor").notNull(),
    reasonCode: text("reason_code").notNull(),
    disputed: integer("disputed").notNull(),
    status: text("status").notNull(),
    requestedBy: text("requested_by"),
    requestedAt: integer("requested_at").notNull(),
    settledAt: integer("settled_at"),
    lastNote: text("last_note"),
    version: integer("version").notNull(),
  },
  (t) => [
    index("refunds_status_idx").on(t.status),
    index("refunds_payment_idx").on(t.paymentId),
    index("refunds_merchant_case_idx").on(t.merchantCaseId),
  ],
);

/**
 * A merchant's Companies House status, keyed by its KYC case. Only an
 * administration, liquidation or dissolved result is kept; KYC merchant
 * monitoring writes it and the refunds `merchant_insolvency` rule reads it.
 */
export const merchantRegistryStatus = sqliteTable("merchant_registry_status", {
  caseId: text("case_id").primaryKey(),
  companyStatus: text("company_status").notNull(),
  checkedAt: integer("checked_at").notNull(),
});
