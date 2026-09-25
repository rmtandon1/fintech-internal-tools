import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "@console/db";
import { sqlite } from "@console/db-core";
import { registerConstants } from "@console/engine/policy/register";
import { configureEngine } from "@console/engine/registry";
import type { Actor, ToolDeclaration } from "@console/engine/types";
import { getTool } from "@/registry";
import { WIDGETS_DDL, vaultTool, widgetTool, widgets } from "../fixtures/widgets";

export const kycReviewer: Actor = {
  id: "usr_kyc_reviewer",
  name: "KYC reviewer",
  role: "kyc_reviewer",
};
export const kycManager: Actor = {
  id: "usr_kyc_manager",
  name: "KYC manager",
  role: "kyc_manager",
};
export const refundsAgent: Actor = {
  id: "usr_refunds_agent",
  name: "Refunds agent",
  role: "refunds_agent",
};
export const refundsManager: Actor = {
  id: "usr_refunds_manager",
  name: "Refunds manager",
  role: "refunds_manager",
};
export const otherManager: Actor = {
  id: "usr_kyc_manager_2",
  name: "KYC manager 2",
  role: "kyc_manager",
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
