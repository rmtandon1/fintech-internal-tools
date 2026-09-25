import { and, eq, gte } from "drizzle-orm";
import { db } from "@console/db";
import { loadConstants } from "@console/engine/policy/constants";
import type { ClusterGroup } from "@console/engine/types";
import { refunds } from "./schema";

export const MANAGER_APPROVAL_USD_KEY = "refunds.manager_approval_usd_minor";
export const CLUSTERING_WINDOW_DAYS_KEY = "refunds.clustering_window_days";

export const DEFAULT_MANAGER_APPROVAL_USD_MINOR = 50_000;
export const DEFAULT_CLUSTERING_WINDOW_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;

/** The window the cluster looks back over, in days; never zero or negative. */
export function clusteringWindowDays(): number {
  const days = loadConstants().number(CLUSTERING_WINDOW_DAYS_KEY, DEFAULT_CLUSTERING_WINDOW_DAYS);
  return days > 0 ? days : DEFAULT_CLUSTERING_WINDOW_DAYS;
}

/**
 * Merchants whose `not_received` refunds inside the window each sit below the
 * manager line but add up to it or more. Every row on its own passes
 * `amount_approval`; only the aggregate shows the pattern.
 */
export function notReceivedByMerchant(now = Date.now()): ClusterGroup[] {
  const managerUsd = loadConstants().number(
    MANAGER_APPROVAL_USD_KEY,
    DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  );
  const windowDays = clusteringWindowDays();
  const since = now - windowDays * DAY;

  const rows = db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      usdMinor: refunds.usdMinor,
      requestedAt: refunds.requestedAt,
    })
    .from(refunds)
    .where(and(eq(refunds.reasonCode, "not_received"), gte(refunds.requestedAt, since)))
    .orderBy(refunds.requestedAt)
    .all();

  const byMerchant = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byMerchant.get(row.merchant) ?? [];
    bucket.push(row);
    byMerchant.set(row.merchant, bucket);
  }

  const groups: ClusterGroup[] = [];
  for (const [merchant, bucket] of byMerchant) {
    if (bucket.some((r) => r.usdMinor >= managerUsd)) continue;
    const totalUsdMinor = bucket.reduce((sum, r) => sum + r.usdMinor, 0);
    if (totalUsdMinor < managerUsd) continue;
    groups.push({
      key: merchant,
      label: merchant,
      count: bucket.length,
      qualifier: "not_received",
      totalUsdMinor,
      windowDays,
      recordIds: bucket.map((r) => r.id),
    });
  }
  return groups.sort((a, b) => b.totalUsdMinor - a.totalUsdMinor);
}
