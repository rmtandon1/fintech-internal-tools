import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqlite } from "@console/db-core";

/** Read connection. Every read path in the app uses this. */
export const db = drizzle(sqlite);

export type AppDatabase = typeof db;
