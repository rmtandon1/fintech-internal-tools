import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

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

export const sqlite = globalForDb.__consoleSqlite ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.__consoleSqlite = sqlite;

/** Read connection. Every read path in the app uses this. */
export const db = drizzle(sqlite);

export type AppDatabase = typeof db;
