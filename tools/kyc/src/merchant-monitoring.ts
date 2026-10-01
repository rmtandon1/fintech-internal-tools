import { and, asc, eq } from "drizzle-orm";
import { db } from "@console/db";
import type { WriteHandle } from "@console/engine/types";
import { isInsolventCompanyStatus } from "@console/tool-refunds";
import { merchantRegistryStatus } from "@console/tool-refunds/schema";
import type { CheckResult } from "./case-file";
import { lookupCompany, type CompaniesHouseTransport } from "./companies-house";
import { kycCases, kycChecks, kycDiscrepancies } from "./schema";

/** One merchant's result from a Companies House recheck. */
export interface MerchantRecheck {
  caseId: string;
  /** The status Companies House holds, or null when it couldn't be checked. */
  companyStatus: string | null;
  /** The name the company is registered under now. */
  companyName: string | null;
  /** Why it couldn't be checked, or null when it was. */
  couldntCheck: string | null;
  testData: boolean;
}

interface Finding {
  result: CheckResult;
  found: string;
  detail: string;
  lastNote: string;
}

const SOURCE = "Companies House";
const TOPIC = "Company status";
const DECLARED = "active";

/** Approved UK business cases: the merchants the recheck covers. */
export function approvedUkMerchants(): { id: string; documentNumber: string }[] {
  return db
    .select({ id: kycCases.id, documentNumber: kycCases.documentNumber })
    .from(kycCases)
    .where(
      and(
        eq(kycCases.status, "approved"),
        eq(kycCases.country, "GB"),
        eq(kycCases.segment, "business"),
        eq(kycCases.documentType, "company_registry"),
      ),
    )
    .orderBy(asc(kycCases.id))
    .all();
}

/** One Companies House lookup per approved UK merchant. Reads only. */
export function recheckMerchants(transport: CompaniesHouseTransport): MerchantRecheck[] {
  return approvedUkMerchants().map((merchant) => {
    const lookup = lookupCompany(transport, merchant.documentNumber);
    return lookup.kind === "found"
      ? {
          caseId: merchant.id,
          companyStatus: lookup.companyStatus,
          companyName: lookup.companyName,
          couldntCheck: null,
          testData: lookup.testData,
        }
      : {
          caseId: merchant.id,
          companyStatus: null,
          companyName: null,
          couldntCheck: lookup.reason,
          testData: lookup.testData,
        };
  });
}

/** How one result reads in the audit summary; case ids and statuses only. */
export function recheckLine(r: MerchantRecheck): string {
  return `${r.caseId} ${r.couldntCheck ? `couldn't check (${r.couldntCheck})` : r.companyStatus}`;
}

export function recheckSummary(results: MerchantRecheck[]): string {
  const testData = results.some((r) => r.testData) ? " (test data)" : "";
  const n = results.length;
  return `Companies House recheck of ${n} merchant${n === 1 ? "" : "s"}${testData}: ${results.map(recheckLine).join(", ")}`;
}

/**
 * What a result puts on the case file, or null when it changes nothing.
 * Administration, liquidation or dissolved is a material difference from the
 * active company declared at onboarding; a lookup that failed is one too, so
 * a person looks rather than the approval standing unchecked.
 */
export function findingFor(r: MerchantRecheck): Finding | null {
  if (r.couldntCheck) {
    return {
      result: "needs_review",
      found: `couldn't check (${r.couldntCheck})`,
      detail: `Couldn't check Companies House: ${r.couldntCheck}`,
      lastNote: "Companies House recheck: couldn't check",
    };
  }
  if (r.companyStatus && isInsolventCompanyStatus(r.companyStatus)) {
    return {
      result: "failed",
      found: `${r.companyStatus}, registered as ${r.companyName ?? "unknown"}`,
      detail: `Companies House: ${r.companyStatus}; registered name ${r.companyName ?? "unknown"}`,
      lastNote: `Companies House recheck: ${r.companyStatus}`,
    };
  }
  return null;
}

export function registryDifferenceId(caseId: string): string {
  return `${caseId}_companies_house_status`;
}

/**
 * Writes each result through the governed write handle and returns the cases
 * it changed. A result already on the case file is skipped, so a rerun adds
 * no second check, difference or hold. Only an insolvent status is passed to
 * refunds; a failed lookup holds the case, not the merchant's refunds.
 */
export function writeRecheck(tx: WriteHandle, results: MerchantRecheck[], now: number): string[] {
  const changed: string[] = [];
  for (const r of results) {
    const finding = findingFor(r);
    if (!finding) continue;
    const differenceId = registryDifferenceId(r.caseId);
    const existing = db
      .select({ found: kycDiscrepancies.found })
      .from(kycDiscrepancies)
      .where(eq(kycDiscrepancies.id, differenceId))
      .get();
    if (existing?.found === finding.found) continue;

    const source = r.testData ? `${SOURCE} (test data)` : SOURCE;
    const difference = { topic: TOPIC, declared: DECLARED, found: finding.found, source, severity: "material" };
    tx.insert(kycDiscrepancies)
      .values({ id: differenceId, caseId: r.caseId, ...difference })
      .onConflictDoUpdate({ target: kycDiscrepancies.id, set: difference })
      .run();

    const check = { result: finding.result, source, detail: finding.detail, checkedAt: now };
    tx.insert(kycChecks)
      .values({ id: `${r.caseId}_company_registry`, caseId: r.caseId, kind: "company_registry", ...check })
      .onConflictDoUpdate({ target: kycChecks.id, set: check })
      .run();

    if (r.companyStatus && isInsolventCompanyStatus(r.companyStatus)) {
      const standing = { companyStatus: r.companyStatus, checkedAt: now };
      tx.insert(merchantRegistryStatus)
        .values({ caseId: r.caseId, ...standing })
        .onConflictDoUpdate({ target: merchantRegistryStatus.caseId, set: standing })
        .run();
    }

    const current = db
      .select({ status: kycCases.status, version: kycCases.version })
      .from(kycCases)
      .where(eq(kycCases.id, r.caseId))
      .get();
    if (current?.status === "approved") {
      tx.update(kycCases)
        .set({ status: "escalated", lastNote: finding.lastNote, version: current.version + 1 })
        .where(and(eq(kycCases.id, r.caseId), eq(kycCases.version, current.version)))
        .run();
    }
    changed.push(r.caseId);
  }
  return changed;
}
