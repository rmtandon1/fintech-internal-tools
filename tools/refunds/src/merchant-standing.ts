import { eq } from "drizzle-orm";
import { db } from "@console/db";
import type { ConstantReader, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { merchantRegistryStatus } from "./schema";

/** KYC's merchant monitoring switch; the refunds hold follows it. */
export const MERCHANT_MONITORING_KEY = "kyc.merchant_monitoring";

/** The Companies House statuses that send a merchant and its refunds to a manager. */
export const INSOLVENT_COMPANY_STATUSES = ["administration", "liquidation", "dissolved"] as const;
export type InsolventCompanyStatus = (typeof INSOLVENT_COMPANY_STATUSES)[number];

export function isInsolventCompanyStatus(status: string): status is InsolventCompanyStatus {
  return INSOLVENT_COMPANY_STATUSES.some((s) => s === status);
}

/** The fields of a refund the rule reads. */
export interface MonitoredRefund {
  merchant: string;
  merchantCaseId: string | null;
}

/**
 * The insolvent Companies House status of the refund's linked merchant case,
 * or null. Off while `kyc.merchant_monitoring` is 0, and a refund with no
 * merchant case is never matched by name.
 */
export function merchantInsolvencyFor(
  refund: MonitoredRefund,
  constants: ConstantReader,
): InsolventCompanyStatus | null {
  if (constants.number(MERCHANT_MONITORING_KEY, 0) === 0) return null;
  if (!refund.merchantCaseId) return null;
  const row = db
    .select({ companyStatus: merchantRegistryStatus.companyStatus })
    .from(merchantRegistryStatus)
    .where(eq(merchantRegistryStatus.caseId, refund.merchantCaseId))
    .get();
  return row && isInsolventCompanyStatus(row.companyStatus) ? row.companyStatus : null;
}

export function companyStatusPhrase(status: InsolventCompanyStatus): string {
  return status === "dissolved" ? "dissolved" : `in ${status}`;
}

/** A refund whose merchant is in administration, liquidation or dissolved needs a manager. */
export const merchantInsolvency: Rule<MonitoredRefund, unknown> = ({ record, constants }) => {
  const status = record ? merchantInsolvencyFor(record, constants) : null;
  return record && status
    ? {
        type: "require_approval",
        rule: "merchant_insolvency",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `Merchant ${record.merchant} is ${companyStatusPhrase(status)} on Companies House (merchant case ${record.merchantCaseId})`,
      }
    : { type: "allow", rule: "merchant_insolvency" };
};
