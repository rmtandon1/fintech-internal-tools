import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { databasePath, db } from "@/db/client";

migrate(db, { migrationsFolder: "drizzle" });
console.log(`migrated ${databasePath}`);
