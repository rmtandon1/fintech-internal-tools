import { execFileSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { AUDIT_HEAD_ID } from "@console/engine/audit/append";
import { GENESIS_HASH, computeRowHash, hashableFields, type HashableAuditRow } from "@console/engine/audit/chain";

/**
 * Rebuilds the demo database. By default it keeps what the recorded Devin runs need:
 * every `devin_runs` row (run pages, Undo buttons), the automation
 * `approval_requests`, `idempotency_keys` and `audit_log` rows (the approval
 * trace), re-chained onto the fresh log, and the `audit_head` checkpoint.
 * `data/runs`, `data/replays` and `data/.actor-secret` are files and are never
 * touched. The old database is renamed aside, not deleted.
 *
 *   pnpm db:reset
 *   pnpm db:reset --fresh   # a blank slate: no runs, an empty audit log
 *
 * Stop `pnpm dev` first — this does not check for a running server. Refuses
 * to run under NODE_ENV=production.
 */
if (process.env.NODE_ENV === "production") {
  console.error("db:reset is a local demo aid and refuses to run in production");
  process.exit(1);
}

type Row = Record<string, unknown>;

export interface KeptRows {
  devinRuns: Row[];
  approvalRequests: Row[];
  idempotencyKeys: Row[];
  auditLog: Row[];
}

/** Reads the rows a reset keeps, from a raw better-sqlite3 handle. */
export function readKeptRows(src: Database.Database): KeptRows {
  const devinRuns = src.prepare("SELECT * FROM devin_runs").all() as Row[];
  const approvalRequests = src
    .prepare("SELECT * FROM approval_requests WHERE tool = 'automation'")
    .all() as Row[];
  const idempotencyKeys = src
    .prepare("SELECT * FROM idempotency_keys WHERE tool = 'automation'")
    .all() as Row[];
  const auditLog = src
    .prepare("SELECT * FROM audit_log WHERE tool = 'automation' ORDER BY seq")
    .all() as Row[];
  return { devinRuns, approvalRequests, idempotencyKeys, auditLog };
}

function insertRow(dest: Database.Database, table: string, row: Row): void {
  const columns = Object.keys(row);
  dest
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .run(...columns.map((c) => row[c]));
}

const AUDIT_FIELD: Record<string, keyof HashableAuditRow> = {
  seq: "seq",
  id: "id",
  ts: "ts",
  actor_id: "actorId",
  actor_role: "actorRole",
  tool: "tool",
  action: "action",
  record_type: "recordType",
  record_id: "recordId",
  event: "event",
  summary: "summary",
  payload_json: "payloadJson",
  before_json: "beforeJson",
  after_json: "afterJson",
  decision_json: "decisionJson",
};

function camelCaseRow(row: Row, seq: number): HashableAuditRow {
  const out = { seq } as Record<keyof HashableAuditRow, unknown>;
  for (const [column, field] of Object.entries(AUDIT_FIELD)) {
    if (field === "seq") continue;
    out[field] = row[column];
  }
  return out as HashableAuditRow;
}

/**
 * Restores kept rows onto a freshly set-up database, in one transaction. The
 * audit rows keep their ids, timestamps and payloads but are re-appended onto
 * the destination's current chain head with new seq / prev_hash / row_hash.
 */
export function restoreKeptRows(dest: Database.Database, kept: KeptRows): void {
  const tx = dest.transaction(() => {
    for (const row of kept.devinRuns) insertRow(dest, "devin_runs", row);
    for (const row of kept.approvalRequests) insertRow(dest, "approval_requests", row);
    for (const row of kept.idempotencyKeys) insertRow(dest, "idempotency_keys", row);

    const head = dest
      .prepare("SELECT seq, row_hash FROM audit_log ORDER BY seq DESC LIMIT 1")
      .get() as { seq: number; row_hash: string } | undefined;
    let seq = head?.seq ?? 0;
    let prevHash = head?.row_hash ?? GENESIS_HASH;
    for (const row of kept.auditLog) {
      seq += 1;
      const rowHash = computeRowHash(hashableFields(camelCaseRow(row, seq)), prevHash);
      insertRow(dest, "audit_log", { ...row, seq, prev_hash: prevHash, row_hash: rowHash });
      prevHash = rowHash;
    }
    if (kept.auditLog.length > 0) {
      dest
        .prepare(
          "INSERT INTO audit_head (id, seq, row_hash, updated_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, row_hash = excluded.row_hash, updated_at = excluded.updated_at",
        )
        .run(AUDIT_HEAD_ID, seq, prevHash, Date.now());
    }
  });
  tx();
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function main(): void {
  const dbPath = resolve(process.env.DATABASE_PATH ?? "data/console.db");
  const fresh = process.argv.includes("--fresh");

  let kept: KeptRows = { devinRuns: [], approvalRequests: [], idempotencyKeys: [], auditLog: [] };
  let backupPath: string | null = null;
  if (existsSync(dbPath)) {
    const src = new Database(dbPath);
    src.pragma("wal_checkpoint(TRUNCATE)");
    if (!fresh) kept = readKeptRows(src);
    src.close();
    backupPath = `${dbPath}.before-reset-${stamp()}`;
    renameSync(dbPath, backupPath);
    for (const suffix of ["-wal", "-shm"]) {
      const side = `${dbPath}${suffix}`;
      if (existsSync(side)) renameSync(side, `${backupPath}${suffix}`);
    }
  }

  execFileSync("pnpm", ["db:setup"], { stdio: "inherit" });

  const dest = new Database(dbPath);
  restoreKeptRows(dest, kept);
  dest.close();

  console.log(
    fresh
      ? `fresh database: no runs, empty audit log; previous database at ${backupPath ?? "none"}`
      : `kept ${kept.devinRuns.length} runs and ${kept.auditLog.length} audit rows; previous database at ${backupPath ?? "none"}`,
  );
}

if (process.argv[1]?.endsWith("reset.ts")) main();
