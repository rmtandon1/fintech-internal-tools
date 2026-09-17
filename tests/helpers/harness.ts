import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "@/db/client";
import { registerConstants } from "@/engine/policy/register";
import type { Actor } from "@/engine/types";
import { registerTool } from "@/tools";
import { WIDGETS_DDL, widgetTool, widgets } from "../fixtures/widgets";

export const analyst: Actor = { id: "usr_analyst", name: "Analyst", role: "analyst" };
export const manager: Actor = { id: "usr_manager", name: "Manager", role: "manager" };
export const otherManager: Actor = {
  id: "usr_manager_2",
  name: "Manager 2",
  role: "manager",
};
export const admin: Actor = { id: "usr_admin", name: "Admin", role: "admin" };

/** Fresh schema, fixture tool registered, default constants installed. */
export function setupHarness(): void {
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec(WIDGETS_DDL);
  registerTool(widgetTool);
  registerConstants(widgetTool.constants ?? []);
}

export function makeWidget(id: string, balance: number, status = "open"): void {
  db.insert(widgets)
    .values({
      id,
      name: `Widget ${id}`,
      ownerEmail: `${id}@example.com`,
      balance,
      status,
      version: 1,
    })
    .onConflictDoUpdate({
      target: widgets.id,
      set: { balance, status, version: 1 },
    })
    .run();
}

export function widgetBalance(id: string): number {
  const row = widgetTool.get(id);
  if (!row) throw new Error(`no widget ${id}`);
  return Number(row.balance);
}
