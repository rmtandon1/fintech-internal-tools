import { and, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "@console/db";
import type { Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
  clusteringWindowDays,
} from "./clusters";
import type { Refund } from "./index";
import { refunds } from "./schema";

const DAY = 24 * 60 * 60 * 1000;
const CLUSTER_REASON = "not_received";

export interface HeldCluster {
  merchant: string;
  totalUsdMinor: number;
  managerUsdMinor: number;
  windowDays: number;
}

/** `$1,880`, or `$1,880.50` when there are cents. */
function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}

/** `Kestrel Outdoors $1,880 over $500 in 14 days`. */
export function describeHeldCluster(cluster: HeldCluster): string {
  return (
    `${cluster.merchant} ${usd(cluster.totalUsdMinor)} over ` +
    `${usd(cluster.managerUsdMinor)} in ${cluster.windowDays} days`
  );
}

/**
 * Refunds that count toward a merchant's cluster: `not_received`, not
 * rejected, requested inside the window and each under the manager line
 * (a refund at or over the line already needs a manager on its own).
 */
function clusterRows(windowDays: number, managerUsd: number, now: number) {
  return db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      customerEmail: refunds.customerEmail,
      usdMinor: refunds.usdMinor,
      requestedAt: refunds.requestedAt,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.reasonCode, CLUSTER_REASON),
        ne(refunds.status, "rejected"),
        gte(refunds.requestedAt, now - windowDays * DAY),
        lt(refunds.usdMinor, managerUsd),
      ),
    )
    .all();
}

function requestedFirst(a: { requestedAt: number; id: string }, b: { requestedAt: number; id: string }) {
  return a.requestedAt - b.requestedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The merchant's running `not_received` total up to and including `record`,
 * in request order, when that total reaches the manager line. Null when the
 * window is 0 (switched off), the record is not part of a cluster, or the
 * running total is still under the line.
 */
export function clusteringHoldFor(
  record: Refund,
  managerUsd: number,
  now = Date.now(),
): HeldCluster | null {
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return null;
  if (record.reasonCode !== CLUSTER_REASON || record.usdMinor >= managerUsd) return null;
  if (record.requestedAt < now - windowDays * DAY) return null;

  const earlier = clusterRows(windowDays, managerUsd, now).filter(
    (r) => r.merchant === record.merchant && r.id !== record.id && requestedFirst(r, record) < 0,
  );
  const totalUsdMinor = earlier.reduce((sum, r) => sum + r.usdMinor, record.usdMinor);
  if (totalUsdMinor < managerUsd) return null;
  return { merchant: record.merchant, totalUsdMinor, managerUsdMinor: managerUsd, windowDays };
}

/**
 * The held cluster a customer's refund belongs to: a merchant whose
 * `not_received` refunds inside the window add up to the manager line or
 * more. Null when the window is 0 or the customer is in no such cluster.
 */
export function heldClusterForCustomer(
  email: string,
  managerUsd: number,
  now = Date.now(),
): HeldCluster | null {
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return null;

  const rows = clusterRows(windowDays, managerUsd, now);
  const merchants = new Set(rows.filter((r) => r.customerEmail === email).map((r) => r.merchant));
  let held: HeldCluster | null = null;
  for (const merchant of merchants) {
    const totalUsdMinor = rows
      .filter((r) => r.merchant === merchant)
      .reduce((sum, r) => sum + r.usdMinor, 0);
    if (totalUsdMinor >= managerUsd && (!held || totalUsdMinor > held.totalUsdMinor)) {
      held = { merchant, totalUsdMinor, managerUsdMinor: managerUsd, windowDays };
    }
  }
  return held;
}

/**
 * Holds a `not_received` refund for a manager once the merchant's running
 * total inside `refunds.clustering_window_days` reaches the manager line.
 */
export const clusteringHold: Rule<Refund, unknown> = ({ record, constants }) => {
  const managerUsd = constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR);
  const held = record ? clusteringHoldFor(record, managerUsd) : null;
  return held
    ? {
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: describeHeldCluster(held),
      }
    : { type: "allow", rule: "clustering_hold" };
};
