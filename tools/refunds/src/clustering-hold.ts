import { and, asc, eq, gte, ne } from "drizzle-orm";
import { db } from "@console/db";
import type { ConstantReader, Rule, RuleOutcome } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  DEFAULT_CLUSTERING_WINDOW_DAYS,
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
} from "./clusters";
import { refunds } from "./schema";

const DAY = 24 * 60 * 60 * 1000;
const NOT_RECEIVED = "not_received";

/** The fields of a refund the hold reads. */
export interface HoldableRefund {
  id: string;
  merchant: string;
  reasonCode: string;
}

export interface ClusterHold {
  merchant: string;
  /** The merchant's `not_received` total up to and including the held refund. */
  runningTotalUsdMinor: number;
  limitUsdMinor: number;
  windowDays: number;
}

/**
 * `refunds.clustering_window_days` as the hold reads it. A missing row or 0
 * is off; a negative value falls back to the default window.
 */
function holdWindowDays(constants: ConstantReader): number {
  const days = constants.number(CLUSTERING_WINDOW_DAYS_KEY, 0);
  if (days === 0) return 0;
  return days > 0 ? days : DEFAULT_CLUSTERING_WINDOW_DAYS;
}

/**
 * The hold on one refund, or null. The merchant's non-rejected `not_received`
 * refunds inside the window are summed in the order they were requested; the
 * refund that takes the total to the manager limit, and every one after it,
 * is held.
 */
export function clusterHoldFor(
  refund: HoldableRefund,
  constants: ConstantReader,
  now = Date.now(),
): ClusterHold | null {
  if (refund.reasonCode !== NOT_RECEIVED) return null;
  const windowDays = holdWindowDays(constants);
  if (windowDays === 0) return null;
  const limitUsdMinor = constants.number(
    MANAGER_APPROVAL_USD_KEY,
    DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  );

  const rows = db
    .select({ id: refunds.id, usdMinor: refunds.usdMinor })
    .from(refunds)
    .where(
      and(
        eq(refunds.merchant, refund.merchant),
        eq(refunds.reasonCode, NOT_RECEIVED),
        ne(refunds.status, "rejected"),
        gte(refunds.requestedAt, now - windowDays * DAY),
      ),
    )
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all();

  let runningTotalUsdMinor = 0;
  for (const row of rows) {
    runningTotalUsdMinor += row.usdMinor;
    if (row.id !== refund.id) continue;
    return runningTotalUsdMinor >= limitUsdMinor
      ? { merchant: refund.merchant, runningTotalUsdMinor, limitUsdMinor, windowDays }
      : null;
  }
  return null;
}

/** The first hold on any of this customer's refunds, or null. */
export function clusterHoldForCustomer(
  email: string,
  constants: ConstantReader,
  now = Date.now(),
): ClusterHold | null {
  if (holdWindowDays(constants) === 0) return null;
  const rows = db
    .select({ id: refunds.id, merchant: refunds.merchant, reasonCode: refunds.reasonCode })
    .from(refunds)
    .where(
      and(
        eq(refunds.customerEmail, email),
        eq(refunds.reasonCode, NOT_RECEIVED),
        ne(refunds.status, "rejected"),
      ),
    )
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all();
  for (const row of rows) {
    const hold = clusterHoldFor(row, constants, now);
    if (hold) return hold;
  }
  return null;
}

/** `Kestrel Outdoors "not received" refunds reach $1,880 in 14 days, over the $500 manager limit` */
export function clusterHoldReason(hold: ClusterHold): string {
  return (
    `${hold.merchant} "not received" refunds reach ${usd(hold.runningTotalUsdMinor)} ` +
    `in ${hold.windowDays === 1 ? "1 day" : `${hold.windowDays} days`}, ` +
    `over the ${usd(hold.limitUsdMinor)} manager limit`
  );
}

export const clusteringHold: Rule<HoldableRefund, unknown> = ({ record, constants }): RuleOutcome => {
  const hold = record ? clusterHoldFor(record, constants) : null;
  return hold
    ? {
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: clusterHoldReason(hold),
      }
    : { type: "allow", rule: "clustering_hold" };
};

/** `$1,880`, or `$1,880.50` when there are cents. */
function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}
