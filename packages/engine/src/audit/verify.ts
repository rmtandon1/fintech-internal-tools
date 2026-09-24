import { asc, eq } from "drizzle-orm";
import { auditHead, auditLog } from "@console/db-core/engine-schema";
import { transact } from "@console/db-write";
import { AUDIT_HEAD_ID } from "./append";
import { GENESIS_HASH, computeRowHash } from "./chain";

export type BreakType =
  | "seq_gap"
  | "prev_mismatch"
  | "row_hash_mismatch"
  | "head_mismatch";

export interface ChainBreak {
  type: BreakType;
  seq: number;
  id: string;
  detail: string;
}

export interface VerifyResult {
  ok: boolean;
  length: number;
  lastHash: string;
  /** The first break found, walking the chain from seq 1 upwards. */
  firstBreak: ChainBreak | null;
}

export function verifyChain(): VerifyResult {
  // Rows and checkpoint are read in one transaction: appends write both
  // together, so reading them from different snapshots would report a
  // concurrent append as truncation.
  const { rows, head } = transact((tx) => ({
    rows: tx.select().from(auditLog).orderBy(asc(auditLog.seq)).all(),
    head: tx.select().from(auditHead).where(eq(auditHead.id, AUDIT_HEAD_ID)).get(),
  }));

  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;

  for (const row of rows) {
    if (row.seq !== expectedSeq) {
      return {
        ok: false,
        length: rows.length,
        lastHash: prevHash,
        firstBreak: {
          type: "seq_gap",
          seq: row.seq,
          id: row.id,
          detail: `expected seq ${expectedSeq}, found ${row.seq}`,
        },
      };
    }
    if (row.prevHash !== prevHash) {
      return {
        ok: false,
        length: rows.length,
        lastHash: prevHash,
        firstBreak: {
          type: "prev_mismatch",
          seq: row.seq,
          id: row.id,
          detail: `prev_hash ${short(row.prevHash)} does not match previous row hash ${short(prevHash)}`,
        },
      };
    }
    const recomputed = computeRowHash(row, row.prevHash);
    if (recomputed !== row.rowHash) {
      return {
        ok: false,
        length: rows.length,
        lastHash: prevHash,
        firstBreak: {
          type: "row_hash_mismatch",
          seq: row.seq,
          id: row.id,
          detail: `stored ${short(row.rowHash)}, recomputed ${short(recomputed)} — row contents were altered`,
        },
      };
    }
    prevHash = row.rowHash;
    expectedSeq += 1;
  }

  // A hash chain cannot prove how many rows there were: deleting the tail
  // leaves a shorter but internally consistent chain. The head checkpoint,
  // written with every append, is what makes truncation visible.
  const lastRow = rows[rows.length - 1];
  const headMissing = rows.length > 0 && !head;
  if (headMissing || (head && (head.seq !== rows.length || head.rowHash !== prevHash))) {
    return {
      ok: false,
      length: rows.length,
      lastHash: prevHash,
      firstBreak: {
        type: "head_mismatch",
        seq: head?.seq ?? rows.length,
        id: lastRow?.id ?? "-",
        detail: head
          ? `head checkpoint is seq ${head.seq} / ${short(head.rowHash)}, log ends at seq ${rows.length} / ${short(prevHash)} — rows were removed`
          : "head checkpoint is missing",
      },
    };
  }

  return {
    ok: true,
    length: rows.length,
    lastHash: prevHash,
    firstBreak: null,
  };
}

function short(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 12)}…` : hash;
}
