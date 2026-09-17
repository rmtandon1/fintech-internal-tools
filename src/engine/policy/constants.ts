import { db } from "@/db/client";
import { runtimeConstants } from "@/db/engine-schema";
import type { ConstantReader } from "@/engine/types";

export interface ConstantRow {
  key: string;
  value: number | string[] | boolean;
  type: "number" | "string_list" | "boolean";
  description: string;
  tool: string;
  updatedAt: number;
  updatedBy: string;
}

/**
 * Reads every runtime constant from the database. Called once per policy
 * evaluation so threshold edits take effect without a redeploy.
 */
export function loadConstants(): ConstantReader {
  const rows = db.select().from(runtimeConstants).all();
  const map = new Map(rows.map((r) => [r.key, JSON.parse(r.valueJson) as unknown]));

  return {
    number(key, fallback) {
      const value = map.get(key);
      return typeof value === "number" ? value : fallback;
    },
    stringList(key, fallback) {
      const value = map.get(key);
      return Array.isArray(value) ? (value as string[]) : fallback;
    },
    boolean(key, fallback) {
      const value = map.get(key);
      return typeof value === "boolean" ? value : fallback;
    },
  };
}

export function listConstants(): ConstantRow[] {
  return db
    .select()
    .from(runtimeConstants)
    .all()
    .map((r) => ({
      key: r.key,
      value: JSON.parse(r.valueJson) as number | string[] | boolean,
      type: r.type,
      description: r.description,
      tool: r.tool,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
