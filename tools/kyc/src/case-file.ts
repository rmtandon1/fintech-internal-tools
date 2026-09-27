import { asc, eq, sql } from "drizzle-orm";
import { db } from "@console/db";
import { kycChecks, kycDiscrepancies } from "./schema";

/** The checks a case file shows, in the order the panel lists them. */
export const CHECK_KINDS = [
  "sanctions",
  "pep",
  "adverse_media",
  "company_registry",
  "identity_document",
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export type CheckResult =
  | "clear"
  | "possible_match"
  | "match"
  | "findings"
  | "needs_review"
  | "verified"
  | "failed"
  | "missing";

export interface KycCheck {
  id: string;
  caseId: string;
  kind: CheckKind;
  result: CheckResult;
  source: string;
  detail: string;
  checkedAt: number;
}

export type DifferenceSeverity = "minor" | "material";

export interface KycDiscrepancy {
  id: string;
  caseId: string;
  topic: string;
  declared: string;
  found: string;
  source: string;
  severity: DifferenceSeverity;
}

export interface KycCaseFile {
  checks: KycCheck[];
  differences: KycDiscrepancy[];
}

const CHECK_RESULT_SET = new Set<string>([
  "clear",
  "possible_match",
  "match",
  "findings",
  "needs_review",
  "verified",
  "failed",
  "missing",
]);

function checkKind(value: string): CheckKind {
  return (CHECK_KINDS as readonly string[]).includes(value)
    ? (value as CheckKind)
    : "adverse_media";
}

function checkResult(value: string): CheckResult {
  return CHECK_RESULT_SET.has(value) ? (value as CheckResult) : "needs_review";
}

function severity(value: string): DifferenceSeverity {
  return value === "material" ? "material" : "minor";
}

/** The case file for one case: its checks in display order, then the register. */
export function caseFile(caseId: string): KycCaseFile {
  const checks = db
    .select()
    .from(kycChecks)
    .where(eq(kycChecks.caseId, caseId))
    .all()
    .map((row) => ({
      id: row.id,
      caseId: row.caseId,
      kind: checkKind(row.kind),
      result: checkResult(row.result),
      source: row.source,
      detail: row.detail,
      checkedAt: row.checkedAt,
    }))
    .sort((a, b) => CHECK_KINDS.indexOf(a.kind) - CHECK_KINDS.indexOf(b.kind));
  const differences = db
    .select()
    .from(kycDiscrepancies)
    .where(eq(kycDiscrepancies.caseId, caseId))
    .orderBy(asc(kycDiscrepancies.id))
    .all()
    .map((row) => ({
      id: row.id,
      caseId: row.caseId,
      topic: row.topic,
      declared: row.declared,
      found: row.found,
      source: row.source,
      severity: severity(row.severity),
    }));
  return { checks, differences };
}

/** SQL selection fragment: count of material rows for kyc_cases.id. */
export const materialDifferences = sql<number>`(select count(*) from kyc_discrepancies d where d.case_id = kyc_cases.id and d.severity = 'material')`.mapWith(Number);
