import { eq } from "drizzle-orm";
import { db } from "@console/db";
import type { ClusterGroup, RuleOutcome } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { clusteringWindowDays, notReceivedByMerchant } from "./clusters";
import { refunds } from "./schema";

export const CLUSTERING_HOLD_RULE = "clustering_hold";

/**
 * The `merchant_not_received` group a refund belongs to, from the same query
 * the pattern strip shows. Null when the window is 0 (hold switched off) or
 * the refund is in no group.
 */
export function heldClusterFor(refundId: string, now = Date.now()): ClusterGroup | null {
  if (clusteringWindowDays() === 0) return null;
  return notReceivedByMerchant(now).find((g) => g.recordIds.includes(refundId)) ?? null;
}

/** Whether any refund raised by this customer sits in a held cluster. */
export function customerInHeldCluster(customerEmail: string, now = Date.now()): boolean {
  if (clusteringWindowDays() === 0) return false;
  const ids = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.customerEmail, customerEmail))
    .all()
    .map((r) => r.id);
  if (ids.length === 0) return false;
  return notReceivedByMerchant(now).some((g) => ids.some((id) => g.recordIds.includes(id)));
}

/**
 * Sends a refund to a refunds manager when its merchant's `not_received`
 * refunds in the window add up to the manager limit, although each one is
 * under it on its own.
 */
export function clusteringHold(refundId: string | undefined, now = Date.now()): RuleOutcome {
  const group = refundId ? heldClusterFor(refundId, now) : null;
  if (!group) return { type: "allow", rule: CLUSTERING_HOLD_RULE };
  const over = group.limit ? `; ${group.limit.label}` : "";
  return {
    type: "require_approval",
    rule: CLUSTERING_HOLD_RULE,
    tier: "manager",
    allowedRoles: rolesFor("refunds", "manager"),
    reason: `${group.headline ?? group.label} in ${group.windowDays ?? 0} days${over}`,
  };
}
