import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { runtimeConstants } from "@console/db-core/engine-schema";
import { transact } from "@console/db-write";
import type { ConstantDefinition } from "../types";

export type { ConstantDefinition };

/**
 * Installs a tool's default thresholds. Existing values are left alone so a
 * re-seed never silently reverts an operator's change.
 */
export function registerConstants(defs: ConstantDefinition[]): void {
  transact((tx) => {
    for (const def of defs) {
      const existing = db
        .select({ key: runtimeConstants.key })
        .from(runtimeConstants)
        .where(eq(runtimeConstants.key, def.key))
        .get();
      if (existing) continue;
      tx.insert(runtimeConstants)
        .values({
          key: def.key,
          valueJson: JSON.stringify(def.value),
          type: def.type,
          description: def.description,
          tool: def.tool,
          updatedAt: Date.now(),
          updatedBy: "system",
        })
        .run();
    }
  });
}
