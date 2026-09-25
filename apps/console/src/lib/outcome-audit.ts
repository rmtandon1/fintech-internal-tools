import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { approvalRequests, auditLog } from "@console/db-core/engine-schema";
import { verifyChain } from "@console/engine/audit/verify";
import { maskRecord } from "@console/engine/pii/mask";
import { resolveTool } from "@console/engine/registry";
import type { Actor, IntentResult } from "@console/engine/types";

/** The audit row an outcome points at, masked like every other record read. */
export interface OutcomeAudit {
  seq: number;
  rowHash: string;
  ts: number;
  actorId: string;
  actorRole: string;
  event: string;
  /**
   * The record before the write. A fresh approval request or denial writes
   * nothing, so its row has no snapshot and the record as it stands at that
   * moment is reported instead; a replay makes no such claim.
   */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  statusField: string;
  /** Record version held by the approval request, when the outcome raised one. */
  frozenVersion: number | null;
  chainOk: boolean;
}

export function readOutcomeAudit(result: IntentResult, actor: Actor): OutcomeAudit | null {
  if (result.outcome.status === "error") return null;
  const row = db.select().from(auditLog).where(eq(auditLog.id, result.outcome.auditId)).get();
  const decl = row ? resolveTool(row.tool) : undefined;
  if (!row || !decl) return null;

  const mask = (record: Record<string, unknown> | null) =>
    record ? maskRecord(decl, record, actor).values : null;
  const before = parseRecord(row.beforeJson);
  const after = parseRecord(row.afterJson);
  const current =
    !before && !after && !result.replayed && row.recordId !== "-"
      ? decl.get(row.recordId)
      : null;
  const frozenVersion =
    result.outcome.status === "pending_approval"
      ? (db
          .select({ recordVersion: approvalRequests.recordVersion })
          .from(approvalRequests)
          .where(eq(approvalRequests.id, result.outcome.approvalId))
          .get()?.recordVersion ?? null)
      : null;

  return {
    seq: row.seq,
    rowHash: row.rowHash,
    ts: row.ts,
    actorId: row.actorId,
    actorRole: row.actorRole,
    event: row.event,
    before: mask(before ?? current),
    after: mask(after),
    statusField: decl.statusField,
    frozenVersion,
    chainOk: verifyChain().ok,
  };
}

function parseRecord(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  const parsed: unknown = JSON.parse(json);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}
