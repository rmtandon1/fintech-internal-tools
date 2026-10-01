import { eq } from "drizzle-orm";
import { db } from "@console/db";
import type { ClusterGroup, ConstantReader, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
  clusteringWindowDays,
  notReceivedByMerchant,
} from "./clusters";
import type { Refund } from "./index";
import { refunds } from "./schema";

export const CLUSTERING_HOLD_KEY = "refunds.clustering_hold";

/** On when the switch is on and the clustering window is not 0. */
export function clusteringHoldOn(constants: ConstantReader): boolean {
  return constants.boolean(CLUSTERING_HOLD_KEY, false) && clusteringWindowDays() > 0;
}

/** Merchants whose `not_received` refunds the hold sends to a manager; none while it is off. */
export function heldClusters(constants: ConstantReader): ClusterGroup[] {
  return clusteringHoldOn(constants) ? notReceivedByMerchant() : [];
}

/**
 * Every pending refund in a merchant's `not_received` cluster needs a manager,
 * the first one included, so the whole cluster sits in the manager's queue.
 */
export const clusteringHold: Rule<Refund, unknown> = ({ record, constants }) => {
  const group =
    record && record.reasonCode === "not_received"
      ? heldClusters(constants).find((g) => g.recordIds.includes(record.id))
      : undefined;
  return group
    ? {
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `Possible fraud: ${group.headline}, past the ${usd(constants.number(MANAGER_APPROVAL_USD_KEY, DEFAULT_MANAGER_APPROVAL_USD_MINOR))} manager limit`,
      }
    : { type: "allow", rule: "clustering_hold" };
};

/** The held cluster one of this customer's refunds sits in, or null. */
export function heldClusterForCustomer(
  customerEmail: string,
  constants: ConstantReader,
): ClusterGroup | null {
  const groups = heldClusters(constants);
  if (groups.length === 0) return null;
  const ids = new Set(
    db
      .select({ id: refunds.id })
      .from(refunds)
      .where(eq(refunds.customerEmail, customerEmail))
      .all()
      .map((r) => r.id),
  );
  return groups.find((g) => g.recordIds.some((id) => ids.has(id))) ?? null;
}

function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}
