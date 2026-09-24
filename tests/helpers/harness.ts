import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "@/db/client";
import { registerConstants } from "@/engine/policy/register";
import { configureEngine } from "@/engine/registry";
import type { Actor, ToolDeclaration } from "@/engine/types";
import { getTool } from "@/tools";
import { WIDGETS_DDL, vaultTool, widgetTool, widgets } from "../fixtures/widgets";

export const analyst: Actor = { id: "usr_analyst", name: "Analyst", role: "analyst" };
export const manager: Actor = { id: "usr_manager", name: "Manager", role: "manager" };
export const otherManager: Actor = {
  id: "usr_manager_2",
  name: "Manager 2",
  role: "manager",
};
export const admin: Actor = { id: "usr_admin", name: "Admin", role: "admin" };

/**
 * Fixture tools take precedence over the shipped registry, so engine tests
 * never depend on a real tool while tool tests can still address theirs.
 */
const fixtures = new Map<string, ToolDeclaration>(
  [widgetTool, vaultTool].map((t) => [t.name, t]),
);

/** Fresh schema, fixture tools registered, default constants installed. */
export function setupHarness(): void {
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec(WIDGETS_DDL);
  configureEngine({ tools: { get: (name) => fixtures.get(name) ?? getTool(name) } });
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
