import { eq } from "drizzle-orm";
import { idempotencyKeys } from "@console/db-core/engine-schema";
import type { Actor, IntentResult, WriteHandle } from "./types";
import { canonicalJson, sha256 } from "./audit/canonical";

export function requestHash(input: {
  tool: string;
  action: string;
  recordId: string | null;
  input: unknown;
}): string {
  return sha256(canonicalJson(input));
}

export type Lookup =
  | { kind: "none" }
  | { kind: "replay"; result: IntentResult }
  | { kind: "conflict" }
  | { kind: "in_progress" };

export type Reservation = { kind: "reserved" } | Exclude<Lookup, { kind: "none" }>;

/**
 * Claims the key for this submission. A repeat of the same key with the same
 * payload replays the stored result; the same key with a different payload is
 * a conflict.
 */
export function reserve(
  tx: WriteHandle,
  key: string,
  hash: string,
  actor: Actor,
  tool: string,
  action: string,
): Reservation {
  const existing = tx
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .get();

  if (!existing) {
    const now = Date.now();
    tx.insert(idempotencyKeys)
      .values({
        key,
        actorId: actor.id,
        tool,
        action,
        requestHash: hash,
        status: "in_progress",
        resultJson: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { kind: "reserved" };
  }

  if (existing.requestHash !== hash) return { kind: "conflict" };
  if (existing.status === "in_progress") return { kind: "in_progress" };
  if (!existing.resultJson) return { kind: "in_progress" };

  const stored = JSON.parse(existing.resultJson) as IntentResult;
  return { kind: "replay", result: { ...stored, replayed: true } };
}

/**
 * Read-only lookup of the key's outcome. Used before the record-state check so
 * a retransmitted request replays its own outcome, and a reused key reports a
 * conflict, rather than failing on a record the first attempt already moved on.
 * `reserve` remains the authoritative, race-safe claim inside the transaction.
 */
export function peek(db: WriteHandle, key: string, hash: string): Lookup {
  const existing = db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .get();
  if (!existing) return { kind: "none" };
  if (existing.requestHash !== hash) return { kind: "conflict" };
  if (existing.status === "in_progress" || !existing.resultJson) {
    return { kind: "in_progress" };
  }
  const stored = JSON.parse(existing.resultJson) as IntentResult;
  return { kind: "replay", result: { ...stored, replayed: true } };
}

export function complete(
  tx: WriteHandle,
  key: string,
  result: IntentResult,
  status: "completed" | "failed",
): void {
  tx.update(idempotencyKeys)
    .set({
      status,
      resultJson: JSON.stringify(result),
      updatedAt: Date.now(),
    })
    .where(eq(idempotencyKeys.key, key))
    .run();
}
