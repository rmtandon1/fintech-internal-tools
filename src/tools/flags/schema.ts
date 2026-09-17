import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Feature flags. The key is immutable once created: it is the identifier the
 * application code reads, so renaming it would silently change behaviour.
 */
export const featureFlags = sqliteTable(
  "feature_flags",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    description: text("description").notNull(),
    flagType: text("flag_type").notNull(),
    environment: text("environment").notNull(),
    owner: text("owner").notNull(),
    enabled: integer("enabled").notNull(),
    rolloutPercent: integer("rollout_percent").notNull(),
    customerFacing: integer("customer_facing").notNull(),
    status: text("status").notNull(),
    expiresAt: integer("expires_at"),
    lastChangedBy: text("last_changed_by"),
    lastChangedAt: integer("last_changed_at").notNull(),
    lastNote: text("last_note"),
    version: integer("version").notNull(),
  },
  (t) => [
    index("feature_flags_status_idx").on(t.status),
    index("feature_flags_env_idx").on(t.environment),
  ],
);
