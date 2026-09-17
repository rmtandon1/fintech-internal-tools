import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Customer due diligence cases. `version` is bumped by every governed write
 * and used as the optimistic concurrency predicate.
 */
export const kycCases = sqliteTable(
  "kyc_cases",
  {
    id: text("id").primaryKey(),
    customerName: text("customer_name").notNull(),
    email: text("email").notNull(),
    dateOfBirth: text("date_of_birth").notNull(),
    documentType: text("document_type").notNull(),
    documentNumber: text("document_number").notNull(),
    country: text("country").notNull(),
    segment: text("segment").notNull(),
    riskScore: integer("risk_score").notNull(),
    riskTier: text("risk_tier").notNull(),
    sanctionsHit: integer("sanctions_hit").notNull(),
    documentsComplete: integer("documents_complete").notNull(),
    status: text("status").notNull(),
    openedAt: integer("opened_at").notNull(),
    dueAt: integer("due_at").notNull(),
    lastNote: text("last_note"),
    decidedBy: text("decided_by"),
    version: integer("version").notNull(),
  },
  (t) => [
    index("kyc_cases_status_idx").on(t.status),
    index("kyc_cases_risk_idx").on(t.riskTier),
  ],
);
