import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@console/db";
import type { ConstantReader, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  DEFAULT_CLUSTERING_WINDOW_DAYS,
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
} from "./clusters";
import { refunds } from "./schema";

const DAY = 24 * 60 * 60 * 1000;

/** Declared value of `refunds.clustering_window_days`: 0 keeps the hold off. */
export const CLUSTERING_HOLD_OFF = 0;

interface HoldCandidate {
  id: string;
  merchant: string;
  reasonCode: string;
  status: string;
  usdMinor: number;
  requestedAt: number;
}

export interface ClusteringHold {
  refundId: string;
  merchant: string;
  runningUsdMinor: number;
  limitUsdMinor: number;
  windowDays: number;
}

/**
 * A `not_received` refund is held when its merchant's `not_received` refunds
 * inside the window, rejected ones excluded, add up in request order to the
 * manager limit or more by the time this one is counted. A window of 0 turns
 * the hold off; a negative window falls back to the default.
 */
export function clusteringHoldFor(
  refund: HoldCandidate,
  constants: ConstantReader,
  now = Date.now(),
): ClusteringHold | null {
  if (refund.reasonCode !== "not_received" || refund.status === "rejected") return null;
  const configured = constants.number(CLUSTERING_WINDOW_DAYS_KEY, CLUSTERING_HOLD_OFF);
  if (configured === 0) return null;
  const windowDays = configured > 0 ? configured : DEFAULT_CLUSTERING_WINDOW_DAYS;
  const since = now - windowDays * DAY;
  if (refund.requestedAt < since) return null;

  const limitUsdMinor = constants.number(
    MANAGER_APPROVAL_USD_KEY,
    DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  );
  const earlier = db
    .select({ id: refunds.id, usdMinor: refunds.usdMinor, requestedAt: refunds.requestedAt })
    .from(refunds)
    .where(
      and(
        eq(refunds.merchant, refund.merchant),
        eq(refunds.reasonCode, "not_received"),
        ne(refunds.status, "rejected"),
        ne(refunds.id, refund.id),
        gte(refunds.requestedAt, since),
        lte(refunds.requestedAt, refund.requestedAt),
      ),
    )
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all()
    .filter((row) => row.requestedAt < refund.requestedAt || row.id < refund.id);

  const runningUsdMinor = earlier.reduce((sum, row) => sum + row.usdMinor, refund.usdMinor);
  if (runningUsdMinor < limitUsdMinor) return null;
  return {
    refundId: refund.id,
    merchant: refund.merchant,
    runningUsdMinor,
    limitUsdMinor,
    windowDays,
  };
}

/** Refunds raised from this customer email that the clustering hold holds. */
export function heldRefundsForCustomer(
  email: string,
  constants: ConstantReader,
  now = Date.now(),
): ClusteringHold[] {
  return db
    .select()
    .from(refunds)
    .where(eq(refunds.customerEmail, email))
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all()
    .flatMap((refund) => {
      const hold = clusteringHoldFor(refund, constants, now);
      return hold ? [hold] : [];
    });
}

export const clusteringHold: Rule<HoldCandidate, unknown> = ({ record, constants }) => {
  const hold = record ? clusteringHoldFor(record, constants) : null;
  if (!hold) return { type: "allow", rule: "clustering_hold" };
  return {
    type: "require_approval",
    rule: "clustering_hold",
    tier: "manager",
    allowedRoles: rolesFor("refunds", "manager"),
    reason:
      `${hold.merchant}'s "not received" refunds add up to ${usd(hold.runningUsdMinor)} ` +
      `in ${hold.windowDays} days, past the ${usd(hold.limitUsdMinor)} manager limit`,
  };
};

/** `$1,880`, or `$1,880.50` when there are cents. */
function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}
