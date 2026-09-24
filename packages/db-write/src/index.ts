import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqlite } from "@console/db-core";

/** Untyped-schema handle the engine hands to effects and audit inside a transaction. */
export type WriteHandle = BetterSQLite3Database<Record<string, never>>;

const writeConnection = drizzle(sqlite);

/**
 * The only write handle in the application. Only `@console/engine` lists this
 * package as a dependency; every other package writes by submitting intents.
 */
export function transact<T>(fn: (tx: WriteHandle) => T): T {
  return writeConnection.transaction((tx) => fn(tx as unknown as WriteHandle));
}

/** The same handle outside a transaction, for the engine's own reads. */
export const writeDb = writeConnection as unknown as WriteHandle;
