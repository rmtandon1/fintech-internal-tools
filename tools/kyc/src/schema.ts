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
    pep: integer("pep").notNull().default(0),
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

/**
 * One row per screening check run against a case: sanctions, PEP, adverse
 * media, company registry and the identity document. Rows carry no PII.
 */
export const kycChecks = sqliteTable(
  "kyc_checks",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    kind: text("kind").notNull(),
    result: text("result").notNull(),
    source: text("source").notNull(),
    detail: text("detail").notNull(),
    checkedAt: integer("checked_at").notNull(),
  },
  (t) => [index("kyc_checks_case_idx").on(t.caseId)],
);

/**
 * The declared-vs-found register: where the customer's declaration and the
 * checks disagree, and how much it matters. Material rows hold approval.
 */
export const kycDiscrepancies = sqliteTable(
  "kyc_discrepancies",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id").notNull(),
    topic: text("topic").notNull(),
    declared: text("declared").notNull(),
    found: text("found").notNull(),
    source: text("source").notNull(),
    severity: text("severity").notNull(),
  },
  (t) => [index("kyc_discrepancies_case_idx").on(t.caseId)],
);
