import { and, eq, gte, ne } from "drizzle-orm";
import { db } from "@console/db";
import type { ConstantReader, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
  clusteringWindowDays,
} from "./clusters";
import { refunds } from "./schema";
import type { Refund } from "./index";

const DAY = 24 * 60 * 60 * 1000;
const NOT_RECEIVED = "not_received";

export interface HeldCluster {
  merchant: string;
  totalUsdMinor: number;
  managerUsdMinor: number;
  windowDays: number;
}

export function usdAmount(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}

/**
 * The merchant's `not_received`, non-rejected refunds requested since `since`.
 * `include` counts a refund that is being decided now whatever its age.
 */
function merchantTotal(
  merchant: string,
  since: number,
  include?: { id: string; usdMinor: number },
): number {
  const rows = db
    .select({ id: refunds.id, usdMinor: refunds.usdMinor })
    .from(refunds)
    .where(
      and(
        eq(refunds.merchant, merchant),
        eq(refunds.reasonCode, NOT_RECEIVED),
        ne(refunds.status, "rejected"),
        gte(refunds.requestedAt, since),
      ),
    )
    .all();
  const others = rows.filter((r) => r.id !== include?.id);
  return others.reduce((sum, r) => sum + r.usdMinor, include?.usdMinor ?? 0);
}

/**
 * A `not_received` refund below the manager line goes to a refunds manager
 * once its merchant's `not_received` refunds in the clustering window, this
 * one included, add up to the manager line. Refunds at or over the line are
 * `amount_approval`'s; a zero window switches the hold off.
 */
export const clusteringHold: Rule<Refund, unknown> = ({ record, constants }) => {
  const pass = { type: "allow", rule: "clustering_hold" } as const;
  if (!record || record.reasonCode !== NOT_RECEIVED) return pass;
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return pass;
  const managerUsd = constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR);
  if (record.usdMinor >= managerUsd) return pass;

  const total = merchantTotal(record.merchant, Date.now() - windowDays * DAY, record);
  if (total < managerUsd) return pass;
  return {
    type: "require_approval",
    rule: "clustering_hold",
    tier: "manager",
    allowedRoles: rolesFor("refunds", "manager"),
    reason: `${record.merchant} "not received" refunds add up to ${usdAmount(total)} in ${windowDays} days, past the ${usdAmount(managerUsd)} manager limit`,
  };
};

/**
 * The first merchant cluster the clustering hold is holding that includes one
 * of this customer's refunds, or null. Customers are matched on
 * `customer_email`, as the KYC case's linked activity is.
 */
export function heldClusterForCustomer(
  email: string,
  constants: ConstantReader,
  now = Date.now(),
): HeldCluster | null {
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return null;
  const managerUsd = constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR);
  const since = now - windowDays * DAY;

  const own = db
    .select({ merchant: refunds.merchant, usdMinor: refunds.usdMinor })
    .from(refunds)
    .where(
      and(
        eq(refunds.customerEmail, email),
        eq(refunds.reasonCode, NOT_RECEIVED),
        ne(refunds.status, "rejected"),
        gte(refunds.requestedAt, since),
      ),
    )
    .all();

  for (const merchant of new Set(own.filter((r) => r.usdMinor < managerUsd).map((r) => r.merchant))) {
    const totalUsdMinor = merchantTotal(merchant, since);
    if (totalUsdMinor >= managerUsd) {
      return { merchant, totalUsdMinor, managerUsdMinor: managerUsd, windowDays };
    }
  }
  return null;
}
