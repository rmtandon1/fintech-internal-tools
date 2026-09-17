import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalRequests } from "@/db/engine-schema";
import { transact } from "@/db/write-client";
import { getTool } from "@/tools";
import { appendAudit } from "@/engine/audit/append";
import { applyEffect } from "@/engine/execute-intent";
import type {
  Actor,
  IntentErrorCode,
  IntentResult,
  PolicyTrace,
  Role,
} from "@/engine/types";

export interface ApprovalView {
  id: string;
  tool: string;
  action: string;
  recordType: string;
  recordId: string | null;
  recordVersion: number | null;
  payload: unknown;
  trace: PolicyTrace;
  summary: string;
  reason: string;
  tier: string;
  allowedRoles: Role[];
  requesterId: string;
  requesterRole: Role;
  status: "pending" | "approved" | "rejected" | "failed";
  decidedBy: string | null;
  decidedAt: number | null;
  decisionNote: string | null;
  failureCode: string | null;
  createdAt: number;
}

export function listApprovals(status?: ApprovalView["status"]): ApprovalView[] {
  const rows = status
    ? db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.status, status))
        .orderBy(desc(approvalRequests.createdAt))
        .all()
    : db
        .select()
        .from(approvalRequests)
        .orderBy(desc(approvalRequests.createdAt))
        .all();
  return rows.map(toView);
}

export function getApproval(id: string): ApprovalView | null {
  const row = db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, id))
    .get();
  return row ? toView(row) : null;
}

export function countPendingFor(actor: Actor): number {
  return listApprovals("pending").filter((a) => canDecide(a, actor).ok).length;
}

export function canDecide(
  approval: ApprovalView,
  actor: Actor,
): { ok: true } | { ok: false; reason: string } {
  if (approval.status !== "pending") {
    return { ok: false, reason: `Request is already ${approval.status}` };
  }
  if (!approval.allowedRoles.includes(actor.role)) {
    return {
      ok: false,
      reason: `Requires ${approval.allowedRoles.join(" or ")} — you are ${actor.role}`,
    };
  }
  if (approval.requesterId === actor.id) {
    return { ok: false, reason: "You raised this request; someone else must approve it" };
  }
  return { ok: true };
}

/**
 * Executes a frozen request. The payload, the policy trace and the record
 * version were all captured when the request was raised: nothing is
 * re-decided here except the version check, which fails the approval safely
 * if the record moved in the meantime.
 */
export function approve(actor: Actor, id: string, note?: string): IntentResult {
  const approval = getApproval(id);
  if (!approval) {
    return error("approval_not_found", `No approval request ${id}`);
  }
  const gate = canDecide(approval, actor);
  if (!gate.ok) {
    return error(
      approval.requesterId === actor.id ? "self_approval" : "approval_not_pending",
      gate.reason,
    );
  }

  const decl = getTool(approval.tool);
  const action = decl?.actions.find((a) => a.name === approval.action);
  if (!decl || !action) {
    return error("unknown_action", `${approval.tool}.${approval.action} is not registered`);
  }

  const record = approval.recordId ? decl.get(approval.recordId) : null;
  if (approval.recordId && !record) {
    return failApproval(actor, approval, "record_not_found", "The record no longer exists");
  }
  if (record && record.version !== approval.recordVersion) {
    return failApproval(
      actor,
      approval,
      "version_conflict",
      `Record moved from version ${approval.recordVersion} to ${record.version} since the request was raised`,
    );
  }

  // Self-approval is also blocked at the database level: the row can only be
  // claimed by an actor who is not the requester.
  const claimed = transact((tx) =>
    tx
      .update(approvalRequests)
      .set({
        status: "approved",
        decidedBy: actor.id,
        decidedAt: Date.now(),
        decisionNote: note ?? null,
      })
      .where(
        and(
          eq(approvalRequests.id, id),
          eq(approvalRequests.status, "pending"),
          ne(approvalRequests.requesterId, actor.id),
        ),
      )
      .run(),
  );
  if (claimed.changes !== 1) {
    return error("approval_not_pending", "The request was already decided");
  }

  const result = applyEffect(
    { id: approval.requesterId, name: approval.requesterId, role: approval.requesterRole },
    decl,
    action,
    record,
    approval.payload,
    approval.trace,
    "applied_after_approval",
    { recordId: approval.recordId },
  );

  transact((tx) =>
    appendAudit(tx, {
      actor,
      tool: approval.tool,
      action: approval.action,
      recordType: approval.recordType,
      recordId: approval.recordId ?? "-",
      event: "approval_granted",
      summary: `Approved: ${approval.summary}`,
      payload: approval.payload,
      before: null,
      after: null,
      decision: {
        approvalId: approval.id,
        requesterId: approval.requesterId,
        note: note ?? null,
        trace: approval.trace,
        result: result.outcome.status,
      },
    }),
  );

  const outcome = result.outcome;
  if (outcome.status === "error") {
    transact((tx) =>
      tx
        .update(approvalRequests)
        .set({ status: "failed", failureCode: outcome.code })
        .where(eq(approvalRequests.id, id))
        .run(),
    );
  }

  return result;
}

export function reject(actor: Actor, id: string, note: string): IntentResult {
  const approval = getApproval(id);
  if (!approval) return error("approval_not_found", `No approval request ${id}`);
  const gate = canDecide(approval, actor);
  if (!gate.ok) {
    return error(
      approval.requesterId === actor.id ? "self_approval" : "approval_not_pending",
      gate.reason,
    );
  }

  const claimed = transact((tx) => {
    const res = tx
      .update(approvalRequests)
      .set({
        status: "rejected",
        decidedBy: actor.id,
        decidedAt: Date.now(),
        decisionNote: note,
      })
      .where(
        and(
          eq(approvalRequests.id, id),
          eq(approvalRequests.status, "pending"),
          ne(approvalRequests.requesterId, actor.id),
        ),
      )
      .run();
    if (res.changes === 1) {
      appendAudit(tx, {
        actor,
        tool: approval.tool,
        action: approval.action,
        recordType: approval.recordType,
        recordId: approval.recordId ?? "-",
        event: "approval_rejected",
        summary: `Rejected: ${approval.summary}`,
        payload: approval.payload,
        before: null,
        after: null,
        decision: { approvalId: approval.id, note, trace: approval.trace },
      });
    }
    return res;
  });

  if (claimed.changes !== 1) {
    return error("approval_not_pending", "The request was already decided");
  }

  return {
    outcome: {
      status: "applied",
      recordId: approval.recordId ?? "-",
      auditId: "-",
      summary: `Rejected: ${approval.summary}`,
      trace: approval.trace,
    },
    replayed: false,
  };
}

function failApproval(
  actor: Actor,
  approval: ApprovalView,
  code: "version_conflict" | "record_not_found",
  message: string,
): IntentResult {
  transact((tx) => {
    tx.update(approvalRequests)
      .set({
        status: "failed",
        failureCode: code,
        decidedBy: actor.id,
        decidedAt: Date.now(),
        decisionNote: message,
      })
      .where(eq(approvalRequests.id, approval.id))
      .run();
    appendAudit(tx, {
      actor,
      tool: approval.tool,
      action: approval.action,
      recordType: approval.recordType,
      recordId: approval.recordId ?? "-",
      event: "approval_failed",
      summary: `Approval failed: ${message}`,
      payload: approval.payload,
      before: null,
      after: null,
      decision: { approvalId: approval.id, code, trace: approval.trace },
    });
  });
  return error(code, message);
}

function toView(row: typeof approvalRequests.$inferSelect): ApprovalView {
  return {
    id: row.id,
    tool: row.tool,
    action: row.action,
    recordType: row.recordType,
    recordId: row.recordId,
    recordVersion: row.recordVersion,
    payload: JSON.parse(row.payloadJson) as unknown,
    trace: JSON.parse(row.traceJson) as PolicyTrace,
    summary: row.summary,
    reason: row.reason,
    tier: row.tier,
    allowedRoles: JSON.parse(row.allowedRolesJson) as Role[],
    requesterId: row.requesterId,
    requesterRole: row.requesterRole as Role,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    failureCode: row.failureCode,
    createdAt: row.createdAt,
  };
}

function error(code: IntentErrorCode, message: string): IntentResult {
  return {
    outcome: { status: "error", code, message },
    replayed: false,
  };
}
