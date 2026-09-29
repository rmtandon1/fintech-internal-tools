import { and, eq, gte, lt, lte, ne, or } from "drizzle-orm";
import { db } from "@console/db";
import { listApprovals } from "@console/engine/approvals";
import type { ConstantReader, Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  CLUSTERING_WINDOW_DAYS_KEY,
  DEFAULT_CLUSTERING_WINDOW_DAYS,
  DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  MANAGER_APPROVAL_USD_KEY,
} from "./clusters";
import type { Refund } from "./index";
import { refunds } from "./schema";

const DAY = 24 * 60 * 60 * 1000;

function windowDays(constants: ConstantReader): number {
  const value = constants.number(CLUSTERING_WINDOW_DAYS_KEY, DEFAULT_CLUSTERING_WINDOW_DAYS);
  return value >= 0 ? value : DEFAULT_CLUSTERING_WINDOW_DAYS;
}

export const clusteringHold: Rule<Refund, unknown> = ({ record, constants }) => {
  const days = windowDays(constants);
  const managerUsd = constants.number(
    MANAGER_APPROVAL_USD_KEY,
    DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  );
  if (!record || days === 0 || record.reasonCode !== "not_received" || record.usdMinor >= managerUsd) {
    return { type: "allow", rule: "clustering_hold" };
  }

  const since = Math.max(Date.now() - days * DAY, record.requestedAt - days * DAY);
  if (record.requestedAt < since) return { type: "allow", rule: "clustering_hold" };

  const rows = db
    .select({ usdMinor: refunds.usdMinor })
    .from(refunds)
    .where(
      and(
        eq(refunds.merchant, record.merchant),
        eq(refunds.reasonCode, "not_received"),
        ne(refunds.status, "rejected"),
        lt(refunds.usdMinor, managerUsd),
        gte(refunds.requestedAt, since),
        or(
          lt(refunds.requestedAt, record.requestedAt),
          and(eq(refunds.requestedAt, record.requestedAt), lte(refunds.id, record.id)),
        ),
      ),
    )
    .all();
  const total = rows.reduce((sum, row) => sum + row.usdMinor, 0);
  return total > managerUsd
    ? {
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `${record.merchant} not_received refunds total ${total} USD cents in ${days} days`,
      }
    : { type: "allow", rule: "clustering_hold" };
};

export function heldRefundClusterForCustomer(
  email: string,
  constants: ConstantReader,
): string | null {
  const days = windowDays(constants);
  if (days === 0) return null;
  const pendingIds = listApprovals("pending")
    .filter(
      (approval) =>
        approval.tool === "refunds" &&
        approval.action === "execute" &&
        approval.recordId !== null &&
        approval.trace.some(
          (outcome) => outcome.rule === "clustering_hold" && outcome.type === "require_approval",
        ),
    )
    .map((approval) => approval.recordId)
    .filter((id): id is string => id !== null);
  if (pendingIds.length === 0) return null;

  const managerUsd = constants.number(
    MANAGER_APPROVAL_USD_KEY,
    DEFAULT_MANAGER_APPROVAL_USD_MINOR,
  );
  const rows = db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      customerEmail: refunds.customerEmail,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.reasonCode, "not_received"),
        ne(refunds.status, "rejected"),
        lt(refunds.usdMinor, managerUsd),
        gte(refunds.requestedAt, Date.now() - days * DAY),
      ),
    )
    .all();
  const heldMerchants = new Set(
    rows.filter((row) => pendingIds.includes(row.id)).map((row) => row.merchant),
  );
  return rows.find((row) => row.customerEmail === email && heldMerchants.has(row.merchant))
    ?.merchant ?? null;
}
