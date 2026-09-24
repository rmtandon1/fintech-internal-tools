import type { WriteHandle } from "@/engine/types";
import { db } from "./client";

/**
 * The only write handle in the application. Importing this module outside
 * `src/engine/` is a boundary violation and fails `scripts/check-boundaries.ts`
 * (seed and migration scripts are the documented exception).
 */
export function transact<T>(fn: (tx: WriteHandle) => T): T {
  return db.transaction((tx) => fn(tx as unknown as WriteHandle));
}

/** The same handle outside a transaction, for the engine's own reads. */
export const writeDb = db as unknown as WriteHandle;
