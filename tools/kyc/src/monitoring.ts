import { and, eq } from "drizzle-orm";
import { db } from "@console/db";
import type { ClusterGroup, GovernedRecord } from "@console/engine/types";
import { kycCases, kycChecks } from "./schema";

export const UNMONITORED_MERCHANTS_CLUSTER = "unmonitored_merchants";
/** The one group the cluster makes: every approved UK merchant nobody has rechecked. */
export const UNMONITORED_MERCHANTS_KEY = "approved_uk_merchants";

const YEAR = 365 * 24 * 60 * 60 * 1000;

interface Merchant {
  id: string;
  name: string;
  companyNumber: string;
  lastChecked: number | null;
}

function approvedUkMerchants(): Merchant[] {
  const cases = db
    .select({
      id: kycCases.id,
      name: kycCases.customerName,
      documentNumber: kycCases.documentNumber,
    })
    .from(kycCases)
    .where(
      and(
        eq(kycCases.status, "approved"),
        eq(kycCases.segment, "business"),
        eq(kycCases.country, "GB"),
        eq(kycCases.documentType, "company_registry"),
      ),
    )
    .orderBy(kycCases.id)
    .all();
  return cases.map((c) => {
    const checks = db
      .select({ checkedAt: kycChecks.checkedAt })
      .from(kycChecks)
      .where(and(eq(kycChecks.caseId, c.id), eq(kycChecks.kind, "company_registry")))
      .all();
    const lastChecked = checks.reduce<number | null>(
      (latest, check) => (latest === null || check.checkedAt > latest ? check.checkedAt : latest),
      null,
    );
    return { id: c.id, name: c.name, companyNumber: companyNumber(c.documentNumber), lastChecked };
  });
}

/** `GB00365335` → `00365335`: the number as Companies House prints it. */
export function companyNumber(documentNumber: string): string {
  return documentNumber.replace(/^GB/i, "");
}

/**
 * Approved UK merchants whose company registry check is over a year old:
 * checked once at onboarding, by hand, and never since. UK rules expect
 * ongoing monitoring, so they are one pattern for the queue monitor.
 */
export function unmonitoredMerchants(now = Date.now()): ClusterGroup[] {
  const stale = approvedUkMerchants().filter(
    (m) => m.lastChecked !== null && m.lastChecked < now - YEAR,
  );
  if (stale.length === 0) return [];
  const years = stale.map((m) => new Date(m.lastChecked!).getUTCFullYear());
  const from = Math.min(...years);
  const to = Math.max(...years);
  const when = from === to ? `in ${from}` : `between ${from} and ${to}`;
  const n = stale.length;
  return [
    {
      key: UNMONITORED_MERCHANTS_KEY,
      label: "Approved UK merchants",
      count: n,
      qualifier: "unmonitored",
      totalUsdMinor: 0,
      recordIds: stale.map((m) => m.id),
      headline: `${n} approved UK merchant${n === 1 ? " hasn't" : "s haven't"} been rechecked since onboarding`,
      detail: `Checked by hand once, ${when}. UK rules expect ongoing monitoring.`,
    },
  ];
}

/** `30 Sept 2021`: the day of a check, without the time. */
function day(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The facts the drawer shows for one merchant: company number and last check. */
export function merchantFacts(record: GovernedRecord): { label: string; value: string }[] {
  const merchant = approvedUkMerchants().find((m) => m.id === record.id);
  const number = typeof record.documentNumber === "string" ? companyNumber(record.documentNumber) : "—";
  return [
    { label: "Company number", value: merchant?.companyNumber ?? number },
    { label: "Last checked", value: merchant?.lastChecked ? day(merchant.lastChecked) : "Never" },
  ];
}
