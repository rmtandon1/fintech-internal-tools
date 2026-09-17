import { desc } from "drizzle-orm";
import { ulid } from "ulid";
import { auditHead, auditLog } from "@/db/engine-schema";
import type { Actor, WriteHandle } from "@/engine/types";
import { canonicalJson } from "./canonical";
import { GENESIS_HASH, computeRowHash } from "./chain";

export interface AuditInput {
  actor: Actor;
  tool: string;
  action: string;
  recordType: string;
  recordId: string;
  /** e.g. `applied`, `requested`, `approved`, `rejected`, `pii_revealed`. */
  event: string;
  summary: string;
  payload: unknown;
  before: unknown;
  after: unknown;
  decision: unknown;
  ts?: number;
}

export const AUDIT_HEAD_ID = 1;

/**
 * Appends one row to the tamper-evident audit log and moves the head
 * checkpoint. Must run inside the same transaction as the effect it records,
 * so an effect can never land without its audit row.
 */
export function appendAudit(tx: WriteHandle, input: AuditInput): string {
  const [head] = tx
    .select({ seq: auditLog.seq, rowHash: auditLog.rowHash })
    .from(auditLog)
    .orderBy(desc(auditLog.seq))
    .limit(1)
    .all();
  const seq = (head?.seq ?? 0) + 1;
  const prevHash = head?.rowHash ?? GENESIS_HASH;

  const row = {
    seq,
    id: ulid(),
    ts: input.ts ?? Date.now(),
    actorId: input.actor.id,
    actorRole: input.actor.role,
    tool: input.tool,
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId,
    event: input.event,
    summary: input.summary,
    payloadJson: canonicalJson(input.payload),
    beforeJson: input.before === null ? null : canonicalJson(input.before),
    afterJson: input.after === null ? null : canonicalJson(input.after),
    decisionJson: canonicalJson(input.decision),
  };

  const rowHash = computeRowHash(row, prevHash);
  tx.insert(auditLog).values({ ...row, prevHash, rowHash }).run();

  const checkpoint = { seq, rowHash, updatedAt: Date.now() };
  tx.insert(auditHead)
    .values({ id: AUDIT_HEAD_ID, ...checkpoint })
    .onConflictDoUpdate({ target: auditHead.id, set: checkpoint })
    .run();

  return row.id;
}
