import { canonicalJson, sha256 } from "./canonical";

/** The chain's anchor: the `prev_hash` of the very first audit row. */
export const GENESIS_HASH =
  "genesis:0000000000000000000000000000000000000000000000000000000000000000";

/** Fields covered by the row hash. Changing this set breaks existing chains. */
export interface HashableAuditRow {
  seq: number;
  id: string;
  ts: number;
  actorId: string;
  actorRole: string;
  tool: string;
  action: string;
  recordType: string;
  recordId: string;
  event: string;
  summary: string;
  payloadJson: string;
  beforeJson: string | null;
  afterJson: string | null;
  decisionJson: string;
}

export function hashableFields(row: HashableAuditRow): HashableAuditRow {
  return {
    seq: row.seq,
    id: row.id,
    ts: row.ts,
    actorId: row.actorId,
    actorRole: row.actorRole,
    tool: row.tool,
    action: row.action,
    recordType: row.recordType,
    recordId: row.recordId,
    event: row.event,
    summary: row.summary,
    payloadJson: row.payloadJson,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    decisionJson: row.decisionJson,
  };
}

export function computeRowHash(row: HashableAuditRow, prevHash: string): string {
  return sha256(canonicalJson(hashableFields(row)) + prevHash);
}
