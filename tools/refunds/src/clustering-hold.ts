import { and, eq, gte, ne } from "drizzle-orm";
import { db } from "@console/db";
import type { Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
  clusteringWindowDays,
} from "./clusters";
import { refunds } from "./schema";

export const CLUSTERING_HOLD_RULE = "clustering_hold";

const DAY = 24 * 60 * 60 * 1000;

/** The refund fields the hold reads. */
export interface HoldableRefund {
  id: string;
  merchant: string;
  reasonCode: string;
  usdMinor: number;
  requestedAt: number;
}

export interface ClusterHold {
  merchant: string;
  runningTotalUsdMinor: number;
  managerUsdMinor: number;
  windowDays: number;
}

function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}

function earlier(a: HoldableRefund, b: HoldableRefund): number {
  return a.requestedAt - b.requestedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The hold on one refund, or null. A refund counts when it is `not_received`,
 * not rejected, inside the window and under the manager line on its own (a
 * refund at or over the line is `amount_approval`'s). Counted refunds are
 * added up per merchant in the order they were requested; the one that takes
 * the running total to the manager line, and every one after it, is held.
 * A zero window switches the hold off.
 */
export function clusterHoldFor(
  refund: HoldableRefund,
  managerUsd: number,
  now = Date.now(),
): ClusterHold | null {
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return null;
  const since = now - windowDays * DAY;
  if (
    refund.reasonCode !== "not_received" ||
    refund.usdMinor >= managerUsd ||
    refund.requestedAt < since
  ) {
    return null;
  }

  const rows = db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      reasonCode: refunds.reasonCode,
      usdMinor: refunds.usdMinor,
      requestedAt: refunds.requestedAt,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.merchant, refund.merchant),
        eq(refunds.reasonCode, "not_received"),
        ne(refunds.status, "rejected"),
        gte(refunds.requestedAt, since),
      ),
    )
    .all();

  const runningTotalUsdMinor = rows
    .filter((r) => r.id !== refund.id && r.usdMinor < managerUsd && earlier(r, refund) < 0)
    .reduce((sum, r) => sum + r.usdMinor, refund.usdMinor);
  if (runningTotalUsdMinor < managerUsd) return null;
  return { merchant: refund.merchant, runningTotalUsdMinor, managerUsdMinor: managerUsd, windowDays };
}

/** The customer's refunds the clustering hold would send to a manager. */
export function heldClusterRefunds(
  customerEmail: string,
  managerUsd: number,
  now = Date.now(),
): string[] {
  return db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      reasonCode: refunds.reasonCode,
      usdMinor: refunds.usdMinor,
      requestedAt: refunds.requestedAt,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.customerEmail, customerEmail),
        eq(refunds.reasonCode, "not_received"),
        ne(refunds.status, "rejected"),
      ),
    )
    .all()
    .filter((r) => clusterHoldFor(r, managerUsd, now) !== null)
    .map((r) => r.id);
}

export const clusteringHold: Rule<HoldableRefund, unknown> = ({ record, constants }) => {
  const managerUsd = constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR);
  const hold = record ? clusterHoldFor(record, managerUsd) : null;
  if (!hold) return { type: "allow", rule: CLUSTERING_HOLD_RULE };
  const days = hold.windowDays === 1 ? "1 day" : `${hold.windowDays} days`;
  return {
    type: "require_approval",
    rule: CLUSTERING_HOLD_RULE,
    tier: "manager",
    allowedRoles: rolesFor("refunds", "manager"),
    reason: `${hold.merchant} ${usd(hold.runningTotalUsdMinor)} over ${usd(hold.managerUsdMinor)} in ${days}`,
  };
};
