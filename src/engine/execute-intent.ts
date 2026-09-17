import { ulid } from "ulid";
import { approvalRequests } from "@/db/engine-schema";
import { transact } from "@/db/write-client";
import { getTool } from "@/tools";
import { appendAudit } from "@/engine/audit/append";
import * as idempotency from "@/engine/idempotency";
import { loadConstants } from "@/engine/policy/constants";
import { evaluatePolicy } from "@/engine/policy/evaluate";
import type {
  ActionDecl,
  Actor,
  GovernedRecord,
  Intent,
  IntentErrorCode,
  IntentResult,
  PolicyTrace,
  RuleContext,
  ToolDeclaration,
} from "@/engine/types";

/**
 * The single governed write path. Tools contribute only `decide` and `apply`;
 * every request runs through the same fixed order:
 *
 *   validate → idempotency → policy → approval → effect → audit
 *
 * Nothing in the application writes to a governed table outside this function
 * (or `executeApproved`, which resumes at the effect step with a frozen
 * payload).
 */
export function executeIntent(actor: Actor, intent: Intent): IntentResult {
  const decl = getTool(intent.tool);
  if (!decl) return fail("unknown_tool", `No such tool: ${intent.tool}`);

  const action = decl.actions.find((a) => a.name === intent.action);
  if (!action) {
    return fail("unknown_action", `No such action: ${intent.tool}.${intent.action}`);
  }

  // 1. validate — permissions server-side, then input shape, then record state.
  if (!action.allowedRoles.includes(actor.role)) {
    return fail(
      "forbidden_role",
      `Role ${actor.role} may not perform ${decl.name}.${action.name}`,
    );
  }

  const parsed = action.input.safeParse(intent.input);
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues.map(issueText).join("; "));
  }
  const input = parsed.data;

  let record: GovernedRecord | null = null;
  if (!action.createsRecord) {
    if (!intent.recordId) return fail("record_not_found", "No record id supplied");
    record = decl.get(intent.recordId);
    if (!record) {
      return fail("record_not_found", `No ${decl.recordType}: ${intent.recordId}`);
    }
    if (action.fromStatus && action.fromStatus.length > 0) {
      const status = String(record[decl.statusField]);
      if (!action.fromStatus.includes(status)) {
        return fail(
          "invalid_status",
          `${action.label} is not available while status is "${status}"`,
        );
      }
    }
  }

  // 2. idempotency — claim the key before any side effect.
  const hash = idempotency.requestHash({
    tool: intent.tool,
    action: intent.action,
    recordId: intent.recordId,
    input,
  });
  const reservation = transact((tx) =>
    idempotency.reserve(tx, intent.idempotencyKey, hash, actor, decl.name, action.name),
  );
  if (reservation.kind === "replay") return reservation.result;
  if (reservation.kind === "conflict") {
    return fail(
      "idempotency_conflict",
      "This idempotency key was already used with a different payload",
    );
  }
  if (reservation.kind === "in_progress") {
    return fail("in_progress", "An identical request is still being processed");
  }

  try {
    const result = runGoverned(actor, decl, action, record, input, intent);
    transact((tx) =>
      idempotency.complete(
        tx,
        intent.idempotencyKey,
        result,
        result.outcome.status === "error" ? "failed" : "completed",
      ),
    );
    return result;
  } catch (error) {
    const result = fail(
      "internal_error",
      error instanceof Error ? error.message : "Unexpected engine failure",
    );
    transact((tx) =>
      idempotency.complete(tx, intent.idempotencyKey, result, "failed"),
    );
    return result;
  }
}

function runGoverned(
  actor: Actor,
  decl: ToolDeclaration,
  action: ActionDecl<GovernedRecord>,
  record: GovernedRecord | null,
  input: unknown,
  intent: Intent,
): IntentResult {
  // 3. policy — every rule runs; constants are read fresh.
  const ctx: RuleContext<GovernedRecord, unknown> = {
    actor,
    tool: decl.name,
    action: action.name,
    record,
    input,
    constants: loadConstants(),
  };
  const policy = evaluatePolicy(action.rules, ctx);

  if (policy.effect === "deny") {
    const reason = policy.reason ?? "Denied by policy";
    transact((tx) =>
      appendAudit(tx, {
        actor,
        tool: decl.name,
        action: action.name,
        recordType: decl.recordType,
        recordId: record?.id ?? "-",
        event: "denied",
        summary: `${action.label} denied: ${reason}`,
        payload: input,
        before: null,
        after: null,
        decision: policy,
      }),
    );
    return { outcome: { status: "denied", reason, trace: policy.trace }, replayed: false };
  }

  // 4. approval — freeze payload, trace and record version; stop here.
  if (policy.effect === "require_approval") {
    const preview = action.decide(ctx);
    const approvalId = ulid();
    const reason = policy.reason ?? "Approval required";
    transact((tx) => {
      tx.insert(approvalRequests)
        .values({
          id: approvalId,
          tool: decl.name,
          action: action.name,
          recordType: decl.recordType,
          recordId: record?.id ?? null,
          recordVersion: record?.version ?? null,
          payloadJson: JSON.stringify(input),
          traceJson: JSON.stringify(policy.trace),
          summary: preview.summary,
          reason,
          tier: policy.tier ?? "manager",
          allowedRolesJson: JSON.stringify(policy.allowedRoles ?? ["manager"]),
          requesterId: actor.id,
          requesterRole: actor.role,
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          decisionNote: null,
          failureCode: null,
          createdAt: Date.now(),
        })
        .run();
      appendAudit(tx, {
        actor,
        tool: decl.name,
        action: action.name,
        recordType: decl.recordType,
        recordId: record?.id ?? "-",
        event: "approval_requested",
        summary: `${preview.summary} — awaiting approval: ${reason}`,
        payload: input,
        before: null,
        after: null,
        decision: { ...policy, approvalId },
      });
    });
    return {
      outcome: {
        status: "pending_approval",
        approvalId,
        reason,
        trace: policy.trace,
      },
      replayed: false,
    };
  }

  // 5 + 6. effect and audit, in one transaction.
  return applyEffect(actor, decl, action, record, input, policy.trace, "applied", intent);
}

export function applyEffect(
  actor: Actor,
  decl: ToolDeclaration,
  action: ActionDecl<GovernedRecord>,
  record: GovernedRecord | null,
  input: unknown,
  trace: PolicyTrace,
  event: string,
  intent: Pick<Intent, "recordId">,
): IntentResult {
  const constants = loadConstants();
  const ctx: RuleContext<GovernedRecord, unknown> = {
    actor,
    tool: decl.name,
    action: action.name,
    record,
    input,
    constants,
  };
  const decision = action.decide(ctx);

  let conflict = false;
  const result = transact((tx) => {
    // Optimistic concurrency: the record must not have moved since it was read.
    if (record && intent.recordId) {
      const fresh = decl.get(intent.recordId);
      if (!fresh || fresh.version !== record.version) {
        conflict = true;
        return null;
      }
    }

    const applied = action.apply(
      { tx, actor, record, input, now: Date.now() },
      decision,
    );

    if (applied.before && applied.after.version !== applied.before.version + 1) {
      throw new Error(
        `${decl.name}.${action.name} did not increment the record version`,
      );
    }

    const auditId = appendAudit(tx, {
      actor,
      tool: decl.name,
      action: action.name,
      recordType: decl.recordType,
      recordId: applied.recordId,
      event,
      summary: decision.summary,
      payload: input,
      before: applied.before,
      after: applied.after,
      decision: { effect: "allow", trace },
    });

    return { recordId: applied.recordId, auditId };
  });

  if (conflict || !result) {
    return fail(
      "version_conflict",
      "The record changed while this request was in flight — nothing was applied",
      trace,
    );
  }

  return {
    outcome: {
      status: "applied",
      recordId: result.recordId,
      auditId: result.auditId,
      summary: decision.summary,
      trace,
    },
    replayed: false,
  };
}

function issueText(issue: { path: PropertyKey[]; message: string }): string {
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

function fail(
  code: IntentErrorCode,
  message: string,
  trace?: PolicyTrace,
): IntentResult {
  return { outcome: { status: "error", code, message, trace }, replayed: false };
}
