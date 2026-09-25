import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sqlite } from "@/db/client";
import { approvalRequests } from "@/db/engine-schema";
import { db } from "@/db/client";
import { canDecide, getApproval } from "@/engine/approvals";
import { kycManager, refundsManager } from "../helpers/harness";

/**
 * Upgrade-path coverage for 0004_expand_roles: a database that already holds
 * approval rows written under the flat analyst/manager/admin roles must come
 * out the other side with domain-scoped roles and matching requester ids.
 * Migrations are applied file by file — 0000–0003 first, the legacy rows are
 * inserted, then 0004 runs — so the test exercises the real SQL, not a copy.
 */

function applyMigration(tag: string): void {
  const file = readdirSync("drizzle").find((f) => f.startsWith(tag));
  if (!file) throw new Error(`no migration file for ${tag}`);
  // `--> statement-breakpoint` lines are SQL comments, so exec accepts the
  // file as-is.
  sqlite.exec(readFileSync(join("drizzle", file), "utf8"));
}

interface LegacyRow {
  id: string;
  tool: string;
  allowedRolesJson: string;
  requesterId: string;
  requesterRole: string;
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
      traceJson: "[]",
      decisionJson: "{}",
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

beforeAll(() => {
  for (const tag of ["0000", "0001", "0002", "0003"]) applyMigration(tag);

  insertLegacyApproval({
    id: "appr_kyc",
    tool: "kyc",
    allowedRolesJson: '["manager","admin"]',
    requesterId: "usr_analyst",
    requesterRole: "analyst",
  });
  insertLegacyApproval({
    id: "appr_refunds",
    tool: "refunds",
    allowedRolesJson: '["manager","admin"]',
    requesterId: "usr_manager",
    requesterRole: "manager",
  });
  insertLegacyApproval({
    id: "appr_flags",
    tool: "flags",
    allowedRolesJson: '["manager","admin"]',
    requesterId: "usr_analyst",
    requesterRole: "analyst",
  });
  insertLegacyApproval({
    id: "appr_admin",
    tool: "kyc",
    allowedRolesJson: '["admin"]',
    requesterId: "usr_admin",
    requesterRole: "admin",
  });

  applyMigration("0004");
});

describe("0004_expand_roles", () => {
  it("scopes a kyc approval to the kyc manager and remaps its requester", () => {
    const approval = getApproval("appr_kyc");
    expect(approval?.allowedRoles).toEqual(["kyc_manager", "admin"]);
    expect(approval?.requesterRole).toBe("kyc_reviewer");
    expect(approval?.requesterId).toBe("usr_kyc_reviewer");
  });

  it("scopes a refunds approval to the refunds manager and remaps its requester", () => {
    const approval = getApproval("appr_refunds");
    expect(approval?.allowedRoles).toEqual(["refunds_manager", "admin"]);
    expect(approval?.requesterRole).toBe("refunds_manager");
    expect(approval?.requesterId).toBe("usr_refunds_manager");
  });

  it("opens a flags approval to every manager", () => {
    const approval = getApproval("appr_flags");
    expect(approval?.allowedRoles).toEqual([
      "kyc_manager",
      "refunds_manager",
      "admin",
    ]);
    expect(approval?.requesterRole).toBe("kyc_reviewer");
    expect(approval?.requesterId).toBe("usr_kyc_reviewer");
  });

  it("leaves an admin-only approval untouched", () => {
    const approval = getApproval("appr_admin");
    expect(approval?.allowedRoles).toEqual(["admin"]);
    expect(approval?.requesterRole).toBe("admin");
    expect(approval?.requesterId).toBe("usr_admin");
  });

  it("keeps migrated approvals decidable by their own domain only", () => {
    const kyc = getApproval("appr_kyc");
    if (!kyc) throw new Error("approval request missing");
    expect(canDecide(kyc, kycManager).ok).toBe(true);
    expect(canDecide(kyc, refundsManager).ok).toBe(false);
  });
});
