import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export const databasePath = resolve(
  process.env.DATABASE_PATH ?? "data/console.db",
);

const globalForDb = globalThis as unknown as {
  __consoleSqlite?: Database.Database;
};

function connect(): Database.Database {
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

/**
 * The single SQLite handle. Only `@console/db` (reads) and `@console/db-write`
 * (the engine's write handle) wrap it in Drizzle; scripts use it raw for
 * migrations and demo tampering.
 */
export const sqlite = globalForDb.__consoleSqlite ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.__consoleSqlite = sqlite;
