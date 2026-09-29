import { eq } from "drizzle-orm";
import { db } from "@console/db";
import type { ClusterGroup, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { clusteringWindowDays, notReceivedByMerchant } from "./clusters";
import type { Refund } from "./index";
import { refunds } from "./schema";

/**
 * The `merchant_not_received` group a refund sits in while the hold is on.
 * The group is the cluster inspection's own: `not_received`, not rejected,
 * inside the window, no single row over the manager line, total at or over it.
 */
export function heldClusterFor(refundId: string, now = Date.now()): ClusterGroup | null {
  if (clusteringWindowDays() === 0) return null;
  return notReceivedByMerchant(now).find((g) => g.recordIds.includes(refundId)) ?? null;
}

/** Ids of this customer's refunds that sit in a held cluster, joined on customer email. */
export function heldRefundIdsForCustomer(customerEmail: string, now = Date.now()): string[] {
  if (clusteringWindowDays() === 0) return [];
  const own = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.customerEmail, customerEmail))
    .all();
  if (own.length === 0) return [];
  const held = new Set(notReceivedByMerchant(now).flatMap((g) => g.recordIds));
  return own.map((r) => r.id).filter((id) => held.has(id));
}

/** Refunds that add up past the manager line with the merchant's other `not_received` refunds. */
export const clusteringHold: Rule<Refund, unknown> = ({ record }) => {
  const group = record ? heldClusterFor(record.id) : null;
  return group
    ? {
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `${group.headline}, past the manager limit: a manager must approve`,
      }
    : { type: "allow", rule: "clustering_hold" };
};
