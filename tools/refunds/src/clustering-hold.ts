import { and, asc, eq, gte, ne } from "drizzle-orm";
import { db } from "@console/db";
import { loadConstants } from "@console/engine/policy/constants";
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

export interface HeldCluster {
  totalUsdMinor: number;
  count: number;
  windowDays: number;
  limitUsdMinor: number;
}

function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}

/** Non-rejected `not_received` refunds requested inside the window, oldest first. */
function notReceivedSince(since: number, merchant?: string) {
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
        eq(refunds.reasonCode, "not_received"),
        ne(refunds.status, "rejected"),
        gte(refunds.requestedAt, since),
        merchant === undefined ? undefined : eq(refunds.merchant, merchant),
      ),
    )
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all();
}

function requestedNoLaterThan(
  row: { id: string; requestedAt: number },
  record: { id: string; requestedAt: number },
): boolean {
  return (
    row.requestedAt < record.requestedAt ||
    (row.requestedAt === record.requestedAt && row.id <= record.id)
  );
}

/**
 * Holds a `not_received` refund for a refunds manager once the merchant's
 * running total of `not_received` refunds inside
 * `refunds.clustering_window_days`, up to and including this one, reaches
 * the manager line. Rejected refunds don't count; a window of 0 turns the
 * hold off.
 */
export const clusteringHold: Rule<Refund, unknown> = ({ record, constants }) => {
  const pass = { type: "allow", rule: "clustering_hold" } as const;
  if (!record || record.reasonCode !== "not_received") return pass;
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return pass;
  const since = Date.now() - windowDays * DAY;
  if (record.requestedAt < since) return pass;

  const managerUsd = constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR);
  const earlier = notReceivedSince(since, record.merchant).filter(
    (row) => row.id !== record.id && requestedNoLaterThan(row, record),
  );
  const runningTotal = earlier.reduce((sum, row) => sum + row.usdMinor, record.usdMinor);
  if (runningTotal < managerUsd) return pass;

  return {
    type: "require_approval",
    rule: "clustering_hold",
    tier: "manager",
    allowedRoles: rolesFor("refunds", "manager"),
    reason:
      `${record.merchant}'s not-received refunds add up to ${usd(runningTotal)} over ` +
      `${windowDays === 1 ? "1 day" : `${windowDays} days`}, past the ${usd(managerUsd)} manager limit`,
  };
};

/**
 * The held cluster a customer's `not_received` refunds sit in: a merchant
 * whose `not_received` refunds inside the window add up to the manager line
 * or more. Null when the customer is in none, or the window is 0.
 */
export function heldClusterFor(email: string, now = Date.now()): HeldCluster | null {
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return null;
  const limitUsdMinor = loadConstants().number(
    MANAGER_APPROVAL_USD_KEY,
    DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  );
  const rows = notReceivedSince(now - windowDays * DAY);
  const merchants = new Set(rows.filter((row) => row.customerEmail === email).map((row) => row.merchant));

  let held: HeldCluster | null = null;
  for (const merchant of merchants) {
    const bucket = rows.filter((row) => row.merchant === merchant);
    const totalUsdMinor = bucket.reduce((sum, row) => sum + row.usdMinor, 0);
    if (totalUsdMinor < limitUsdMinor) continue;
    if (!held || totalUsdMinor > held.totalUsdMinor) {
      held = { totalUsdMinor, count: bucket.length, windowDays, limitUsdMinor };
    }
  }
  return held;
}
