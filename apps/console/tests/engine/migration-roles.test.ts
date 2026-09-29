import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { sqlite } from "@console/db-core";
import { approvalRequests, auditLog } from "@console/db-core/engine-schema";
import { db } from "@console/db";
import { appendAudit } from "@console/engine/audit/append";
import { verifyChain } from "@console/engine/audit/verify";
import type { Actor, WriteHandle } from "@console/engine/types";
import { canDecide, getApproval } from "@console/engine/approvals";
import { analyst, manager } from "../helpers/harness";

function applyMigration(tag: string): void {
  const file = readdirSync("drizzle").find((f) => f.startsWith(tag));
  if (!file) throw new Error(`no migration file for ${tag}`);
  sqlite.exec(readFileSync(join("drizzle", file), "utf8"));
}

interface LegacyRow {
  id: string;
  tool: string;
  allowedRolesJson: string;
  requesterId: string;
  requesterRole: string;
  traceJson?: string;
  decisionJson?: string;
}

function insertLegacyApproval(row: LegacyRow): void {
  const now = Date.now();
  db.insert(approvalRequests)
    .values({
      id: row.id,
      tool: row.tool,
      action: "execute",
      recordType: row.tool,
      recordId: `${row.tool}_0001`,
      recordVersion: 1,
      payloadJson: "{}",
      traceJson: row.traceJson ?? "[]",
      decisionJson: row.decisionJson ?? "{}",
      summary: `legacy ${row.tool} request`,
      reason: "raised under flat roles",
      tier: "manager",
      allowedRolesJson: row.allowedRolesJson,
      requesterId: row.requesterId,
      requesterRole: row.requesterRole,
      status: "pending",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      failureCode: null,
      createdAt: now,
    })
    .run();
}

let legacyAuditId = "";

beforeAll(() => {
  for (const tag of ["0000", "0001", "0002", "0003"]) applyMigration(tag);

  insertLegacyApproval({
    id: "appr_kyc",
    tool: "kyc",
    allowedRolesJson: '["kyc_manager","admin"]',
    requesterId: "usr_kyc_reviewer",
    requesterRole: "kyc_reviewer",
  });
  insertLegacyApproval({
    id: "appr_refunds",
    tool: "refunds",
    allowedRolesJson: '["refunds_manager","admin"]',
    requesterId: "usr_refunds_agent",
    requesterRole: "refunds_agent",
    traceJson: JSON.stringify([{ type: "require_approval", allowedRoles: ["refunds_manager"] }]),
    decisionJson: JSON.stringify({ allowedRoles: ["refunds_manager"] }),
  });
  insertLegacyApproval({
    id: "appr_flags",
    tool: "flags",
    allowedRolesJson: '["kyc_manager","refunds_manager","admin"]',
    requesterId: "usr_kyc_reviewer",
    requesterRole: "kyc_reviewer",
  });
  insertLegacyApproval({
    id: "appr_admin",
    tool: "kyc",
    allowedRolesJson: '["admin"]',
    requesterId: "usr_admin",
    requesterRole: "admin",
  });
  applyMigration("0004");
  for (const tag of ["0005", "0006", "0007", "0008", "0009"]) applyMigration(tag);

  const legacyManager = {
    id: "usr_refunds_manager",
    name: "Manager",
    role: "refunds_manager",
  } as unknown as Actor;
  legacyAuditId = drizzle(sqlite).transaction((tx) =>
    appendAudit(tx as unknown as WriteHandle, {
      actor: legacyManager,
      tool: "flags",
      action: "set",
      recordType: "flag",
      recordId: "flag_legacy",
      event: "applied",
      summary: "legacy role audit",
      payload: {},
      before: null,
      after: null,
      decision: { allowedRoles: ["kyc_manager", "refunds_manager", "admin"] },
    }),
  );
  sqlite
    .prepare(
      `INSERT INTO devin_runs
        (id, operation, spec, tool, intent, context_sha256, status,
         requested_by, requested_by_role, requested_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "run_legacy_role",
      "change",
      "REFUND_CLUSTERING_HOLD.md",
      "refunds",
      "legacy run",
      "0".repeat(64),
      "running",
      "usr_refunds_manager",
      "refunds_manager",
      Date.now(),
      Date.now(),
      1,
    );
  applyMigration("0010");
});

describe("0010_flatten_roles", () => {
  it("flattens requester roles and shared manager permission lists", () => {
    const kyc = getApproval("appr_kyc");
    expect(kyc?.allowedRoles).toEqual(["manager", "admin"]);
    expect(kyc?.requesterRole).toBe("analyst");
    expect(kyc?.requesterId).toBe("usr_analyst");

    const refunds = getApproval("appr_refunds");
    expect(refunds?.allowedRoles).toEqual(["manager", "admin"]);
    expect(refunds?.requesterRole).toBe("analyst");
    expect(refunds?.requesterId).toBe("usr_analyst");

    const flags = getApproval("appr_flags");
    expect(flags?.allowedRoles).toEqual(["manager", "admin"]);
    expect(flags?.requesterRole).toBe("analyst");
    expect(flags?.requesterId).toBe("usr_analyst");

    const adminOnly = getApproval("appr_admin");
    expect(adminOnly?.allowedRoles).toEqual(["admin"]);
    expect(adminOnly?.requesterRole).toBe("admin");
  });

  it("keeps migrated approvals decidable by the shared manager", () => {
    const approval = getApproval("appr_refunds");
    if (!approval) throw new Error("approval request missing");
    expect(canDecide(approval, manager).ok).toBe(true);
    expect(canDecide(approval, analyst).ok).toBe(false);
  });

  it("updates live runs without rewriting historical role values or JSON", () => {
    const run = sqlite
      .prepare(
        "SELECT requested_by, requested_by_role FROM devin_runs WHERE id = ?",
      )
      .get("run_legacy_role") as { requested_by: string; requested_by_role: string };
    expect(run).toEqual({ requested_by: "usr_manager", requested_by_role: "manager" });

    const approval = db
      .select({ traceJson: approvalRequests.traceJson, decisionJson: approvalRequests.decisionJson })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, "appr_refunds"))
      .get();
    expect(JSON.parse(approval?.traceJson ?? "[]")[0].allowedRoles).toEqual(["refunds_manager"]);
    expect(JSON.parse(approval?.decisionJson ?? "{}").allowedRoles).toEqual(["refunds_manager"]);

    const audit = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, legacyAuditId))
      .get();
    expect(audit?.actorRole).toBe("refunds_manager");
    expect(audit?.actorId).toBe("usr_refunds_manager");
    expect(JSON.parse(audit?.decisionJson ?? "{}").allowedRoles).toEqual([
      "kyc_manager",
      "refunds_manager",
      "admin",
    ]);
    expect(verifyChain().ok).toBe(true);
  });
});
