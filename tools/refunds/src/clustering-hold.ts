import { inArray } from "drizzle-orm";
import { db } from "@console/db";
import { loadConstants } from "@console/engine/policy/constants";
import type { GovernedRecord, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
  clusteringWindowDays,
  notReceivedByMerchant,
} from "./clusters";
import { refunds } from "./schema";

export interface ClusterHold {
  merchant: string;
  /** The merchant's `not_received` total, oldest first, up to and including this refund. */
  runningUsdMinor: number;
  lineUsdMinor: number;
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

/**
 * Refunds `clustering_hold` sends to a manager, by id: in each merchant
 * cluster, the refund whose running total reaches the manager line and every
 * refund after it. Empty while `refunds.clustering_window_days` is 0.
 */
export function heldRefunds(now = Date.now()): Map<string, ClusterHold> {
  const held = new Map<string, ClusterHold>();
  const windowDays = clusteringWindowDays();
  if (windowDays === 0) return held;
  const lineUsdMinor = loadConstants().number(
    MANAGER_APPROVAL_USD_KEY,
    DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  );
  for (const group of notReceivedByMerchant(now)) {
    const usdById = new Map(
      db
        .select({ id: refunds.id, usdMinor: refunds.usdMinor })
        .from(refunds)
        .where(inArray(refunds.id, group.recordIds))
        .all()
        .map((r) => [r.id, r.usdMinor]),
    );
    let runningUsdMinor = 0;
    for (const id of group.recordIds) {
      runningUsdMinor += usdById.get(id) ?? 0;
      if (runningUsdMinor >= lineUsdMinor) {
        held.set(id, { merchant: group.key, runningUsdMinor, lineUsdMinor, windowDays });
      }
    }
  }
  return held;
}

export const clusteringHold: Rule<GovernedRecord, unknown> = ({ record }) => {
  const hold = record ? heldRefunds().get(record.id) : undefined;
  if (!hold) return { type: "allow", rule: "clustering_hold" };
  return {
    type: "require_approval",
    rule: "clustering_hold",
    tier: "manager",
    allowedRoles: rolesFor("refunds", "manager"),
    reason: `${hold.merchant} ${usd(hold.runningUsdMinor)} over ${usd(hold.lineUsdMinor)} in ${hold.windowDays === 1 ? "1 day" : `${hold.windowDays} days`}`,
  };
};
