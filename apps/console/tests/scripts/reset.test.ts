import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { ulid } from "ulid";
import { db } from "@console/db";
import { sqlite } from "@console/db-core";
import { approvalRequests } from "@console/db-core/engine-schema";
import { appendAudit } from "@console/engine/audit/append";
import { GENESIS_HASH, computeRowHash, type HashableAuditRow } from "@console/engine/audit/chain";
import type { Actor, WriteHandle } from "@console/engine/types";
import { devinRuns } from "@console/tool-automation/schema";
import { readKeptRows, restoreKeptRows } from "../../scripts/reset";
import { setupHarness } from "../helpers/harness";

const adminActor: Actor = { id: "usr_admin", name: "Admin", role: "admin" };

function append(tool: string, recordId: string, summary: string): void {
  db.transaction((tx) =>
    appendAudit(tx as unknown as WriteHandle, {
      actor: adminActor,
      tool,
      action: "execute",
      recordType: tool === "automation" ? "devin_run" : "refund",
      recordId,
      event: "applied",
      summary,
      payload: { recordId },
      before: null,
      after: null,
      decision: { effect: "allow" },
    }),
  );
}

function approval(tool: string, recordId: string): void {
  db.insert(approvalRequests)
    .values({
      id: `appr_${tool}_${recordId}`,
      tool,
      action: "execute",
      recordType: tool === "automation" ? "devin_run" : "refund",
      recordId,
      recordVersion: 1,
      payloadJson: "{}",
      traceJson: "{}",
      decisionJson: "{}",
      summary: `${tool} approval`,
      reason: "demo",
      tier: "manager",
      allowedRolesJson: "[]",
      requesterId: adminActor.id,
      requesterRole: adminActor.role,
      status: "pending",
      createdAt: Date.now(),
    })
    .run();
}

function freshDest(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), "reset-dest-"));
  const dest = new Database(join(dir, "console.db"));
  migrate(drizzle(dest), { migrationsFolder: "drizzle" });
  return dest;
}

let runId: string;

beforeAll(() => {
  setupHarness();
  runId = ulid();
  db.insert(devinRuns)
    .values({
      id: runId,
      operation: "change",
      spec: "COMPANIES_HOUSE_CHECK.md",
      tool: "kyc",
      intent: "add the check",
      contextSha256: "a".repeat(64),
      sessionId: "devin-abc",
      status: "merged",
      prUrl: "https://github.com/acme/repo/pull/1",
      mergeCommit: "b".repeat(40),
      reverses: null,
      requestedBy: adminActor.id,
      requestedByRole: adminActor.role,
      approvedBy: "usr_engineer",
      lastNote: null,
      requestedAt: Date.now(),
      updatedAt: Date.now(),
      version: 4,
    })
    .run();
  append("automation", runId, "first automation row");
  append("refunds", "rfnd_0001", "a refunds row");
  append("automation", runId, "second automation row");
  approval("automation", runId);
  approval("refunds", "rfnd_0001");
});

function rawRows(dest: Database.Database, sql: string) {
  return dest.prepare(sql).all() as Record<string, unknown>[];
}

/** Recomputes the destination chain and returns true when it holds. */
function chainHolds(dest: Database.Database): boolean {
  const rows = rawRows(dest, "SELECT * FROM audit_log ORDER BY seq");
  let prev = GENESIS_HASH;
  for (const [i, row] of rows.entries()) {
    if (row.seq !== i + 1 || row.prev_hash !== prev) return false;
    const hashable = {
      seq: row.seq,
      id: row.id,
      ts: row.ts,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      tool: row.tool,
      action: row.action,
      recordType: row.record_type,
      recordId: row.record_id,
      event: row.event,
      summary: row.summary,
      payloadJson: row.payload_json,
      beforeJson: row.before_json,
      afterJson: row.after_json,
      decisionJson: row.decision_json,
    } as HashableAuditRow;
    const hash = computeRowHash(hashable, prev);
    if (row.row_hash !== hash) return false;
    prev = hash;
  }
  const head = rawRows(dest, "SELECT * FROM audit_head")[0];
  return rows.length === 0 || (head.seq === rows.at(-1)?.seq && head.row_hash === rows.at(-1)?.row_hash);
}

describe("reset keeps recorded runs", () => {
  it("copies devin_runs and automation rows, re-chaining the audit log", () => {
    const kept = readKeptRows(sqlite);
    expect(kept.devinRuns.map((r) => r.id)).toContain(runId);
    expect(kept.auditLog.map((r) => r.summary)).toEqual([
      "first automation row",
      "second automation row",
    ]);
    expect(kept.approvalRequests.map((r) => r.tool)).toEqual(["automation"]);

    const dest = freshDest();
    restoreKeptRows(dest, kept);
    expect(rawRows(dest, "SELECT * FROM devin_runs")).toEqual(kept.devinRuns);
    expect(rawRows(dest, "SELECT * FROM approval_requests")).toEqual(kept.approvalRequests);
    expect(rawRows(dest, "SELECT * FROM idempotency_keys")).toEqual(kept.idempotencyKeys);

    const audit = rawRows(dest, "SELECT * FROM audit_log ORDER BY seq");
    expect(audit).toHaveLength(2);
    expect(audit.map((r) => r.id)).toEqual(kept.auditLog.map((r) => r.id));
    expect(audit.map((r) => r.ts)).toEqual(kept.auditLog.map((r) => r.ts));
    expect(audit.map((r) => r.payload_json)).toEqual(kept.auditLog.map((r) => r.payload_json));
    expect(chainHolds(dest)).toBe(true);
    dest.close();
  });

  it("chains restored rows after audit rows the destination already has", () => {
    const kept = readKeptRows(sqlite);
    const dest = freshDest();
    // A pre-existing row appended the real way, so the restore chains off it.
    drizzle(dest).transaction((tx) =>
      appendAudit(tx as unknown as WriteHandle, {
        actor: adminActor,
        tool: "flags",
        action: "execute",
        recordType: "flag",
        recordId: "app.x",
        event: "applied",
        summary: "pre-existing",
        payload: {},
        before: null,
        after: null,
        decision: { effect: "allow" },
      }),
    );

    restoreKeptRows(dest, kept);
    const audit = rawRows(dest, "SELECT * FROM audit_log ORDER BY seq");
    expect(audit.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(audit.slice(1).map((r) => r.id)).toEqual(kept.auditLog.map((r) => r.id));
    expect(chainHolds(dest)).toBe(true);
    dest.close();
  });
});
