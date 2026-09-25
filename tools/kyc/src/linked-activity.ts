import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { listApprovals } from "@console/engine/approvals";
import type { Actor, LinkedActivity } from "@console/engine/types";
import { refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import type { KycCase } from "./index";

/**
 * Refunds raised by the same customer, joined on `email = customer_email`
 * on the server. The aggregate carries no PII, so every KYC role gets it;
 * rows and the cluster link only go to roles that can open the refunds tool.
 */
export function refundsForCase(record: KycCase, actor: Actor): LinkedActivity | null {
  const rows = db
    .select()
    .from(refunds)
    .where(eq(refunds.customerEmail, record.email))
    .all();
  if (rows.length === 0) return null;

  const pendingIds = new Set(
    listApprovals("pending")
      .filter((a) => a.tool === refundTool.name && a.recordId !== null)
      .map((a) => a.recordId),
  );
  const heldIds = rows.filter((r) => pendingIds.has(r.id)).map((r) => r.id);
  const canOpen = refundTool.visibleTo.includes(actor.role);
  const anchor = rows.find((r) => heldIds.includes(r.id)) ?? rows[0];

  return {
    tool: refundTool.name,
    title: refundTool.displayName,
    summary: {
      count: rows.length,
      total: usd(rows.reduce((sum, r) => sum + r.usdMinor, 0)),
      codes: [...new Set(rows.map((r) => r.reasonCode))].sort(),
      held: heldIds.length,
    },
    rows: canOpen ? rows : [],
    rowFields: ["amountMinor", "customerEmail", "cardLast4", "merchant"],
    heldIds,
    href: canOpen
      ? `/t/${refundTool.name}?q=${encodeURIComponent(anchor.merchant)}`
      : null,
  };
}

function usd(minor: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
}
