import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { databasePath } from "@console/db-core";
import { db } from "@console/db";

migrate(db, { migrationsFolder: "drizzle" });
console.log(`migrated ${databasePath}`);
