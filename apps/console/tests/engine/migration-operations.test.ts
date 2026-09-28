import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sqlite } from "@console/db-core";

/**
 * Upgrade-path coverage for 0008: a database that already holds devin_runs
 * rows written under the kind/scope model must come out the other side with
 * every kind mapped onto an operation — REVERSAL to "undo", everything else
 * to "change". Migrations are applied file by file — 0000–0007 first, the
 * legacy rows are inserted, then 0008 runs — so the test exercises the real
 * SQL, not a copy.
 */

function applyMigration(tag: string): void {
  const file = readdirSync("drizzle").find((f) => f.startsWith(tag));
  if (!file) throw new Error(`no migration file for ${tag}`);
  // `--> statement-breakpoint` lines are SQL comments, so exec accepts the
  // file as-is.
  sqlite.exec(readFileSync(join("drizzle", file), "utf8"));
}

function insertLegacyRun(id: string, kind: string): void {
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO devin_runs
       (id, kind, spec, tool, scope, intent, context_sha256, session_id, status,
        pr_url, merge_commit, reverses, requested_by, requested_by_role,
        approved_by, last_note, requested_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'merged', NULL, NULL, NULL,
               'usr_admin', 'admin', NULL, NULL, ?, ?, 1)`,
    )
    .run(id, kind, "COMPANIES_HOUSE_CHECK.md", "kyc", "rule", "legacy intent", "0".repeat(64), now, now);
}

beforeAll(() => {
  for (const tag of ["0000", "0001", "0002", "0003", "0004", "0005", "0006", "0007"]) {
    applyMigration(tag);
  }

  insertLegacyRun("run_addition", "IMPLEMENTATION/ADDITION");
  insertLegacyRun("run_change", "IMPLEMENTATION/CHANGE");
  insertLegacyRun("run_removal", "IMPLEMENTATION/REMOVAL");
  insertLegacyRun("run_reversal", "REVERSAL");

  applyMigration("0008");
});

describe("0008: run kinds and scopes become operations", () => {
  it("maps every IMPLEMENTATION kind onto change", () => {
    const rows = sqlite
      .prepare("SELECT id, operation FROM devin_runs WHERE id != 'run_reversal' ORDER BY id")
      .all() as { id: string; operation: string }[];
    expect(rows).toEqual([
      { id: "run_addition", operation: "change" },
      { id: "run_change", operation: "change" },
      { id: "run_removal", operation: "change" },
    ]);
  });

  it("maps REVERSAL onto undo", () => {
    const row = sqlite
      .prepare("SELECT operation FROM devin_runs WHERE id = 'run_reversal'")
      .get() as { operation: string };
    expect(row.operation).toBe("undo");
  });

  it("drops the scope column", () => {
    const columns = sqlite.prepare("PRAGMA table_info(devin_runs)").all() as { name: string }[];
    expect(columns.map((c) => c.name)).toContain("operation");
    expect(columns.map((c) => c.name)).not.toContain("kind");
    expect(columns.map((c) => c.name)).not.toContain("scope");
  });
});
