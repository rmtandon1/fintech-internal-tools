import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { databasePath } from "@console/db-core";
import { db } from "@console/db";
import { migratePersistedRoleJson } from "../src/lib/role-migration";

migrate(db, { migrationsFolder: "drizzle" });
migratePersistedRoleJson();
console.log(`migrated ${databasePath}`);
