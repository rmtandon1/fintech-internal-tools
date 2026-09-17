import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/db/engine-schema";
import { GENESIS_HASH, computeRowHash } from "./chain";

export type BreakType = "seq_gap" | "prev_mismatch" | "row_hash_mismatch";

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
  const rows = db.select().from(auditLog).orderBy(asc(auditLog.seq)).all();

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
