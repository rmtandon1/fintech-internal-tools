import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { auditTrailFor, auditStats } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import type { Intent, IntentOutcome } from "@console/engine/types";
import { kycReviewer, makeWidget, setupHarness } from "../helpers/harness";

beforeAll(() => setupHarness());

function spend(recordId: string, amount: number, idempotencyKey = ulid()): Intent {
  return {
    tool: "widgets",
    action: "spend",
    recordId,
    input: { amount, reason: "outcome audit id" },
    idempotencyKey,
  };
}

function auditIdOf(outcome: IntentOutcome): string {
  if (outcome.status === "error") throw new Error(`unexpected error ${outcome.code}`);
  return outcome.auditId;
}

describe("outcome auditId", () => {
  it("applied: matches the row appended in the same transaction", () => {
    makeWidget("w_oid_applied", 100);
    const result = executeIntent(kycReviewer, spend("w_oid_applied", 10));

    expect(result.outcome.status).toBe("applied");
    const [row] = auditTrailFor("widget", "w_oid_applied");
    expect(row.event).toBe("applied");
    expect(auditIdOf(result.outcome)).toBe(row.id);
  });

  it("pending_approval: matches the approval_requested row", () => {
    makeWidget("w_oid_pending", 1000);
    const result = executeIntent(kycReviewer, spend("w_oid_pending", 500));

    expect(result.outcome.status).toBe("pending_approval");
    const [row] = auditTrailFor("widget", "w_oid_pending");
    expect(row.event).toBe("approval_requested");
    expect(auditIdOf(result.outcome)).toBe(row.id);
    if (result.outcome.status === "pending_approval") {
      expect(JSON.parse(row.decisionJson)).toMatchObject({
        approvalId: result.outcome.approvalId,
      });
    }
  });

  it("denied: matches the denied row", () => {
    makeWidget("w_oid_denied", 5);
    const result = executeIntent(kycReviewer, spend("w_oid_denied", 10));

    expect(result.outcome.status).toBe("denied");
    const [row] = auditTrailFor("widget", "w_oid_denied");
    expect(row.event).toBe("denied");
    expect(auditIdOf(result.outcome)).toBe(row.id);
  });

  it("replay: returns the stored auditId and writes no new row", () => {
    makeWidget("w_oid_replay", 100);
    const intent = spend("w_oid_replay", 10);

    const first = executeIntent(kycReviewer, intent);
    const rowsAfterFirst = auditStats().total;
    const second = executeIntent(kycReviewer, intent);

    expect(second.replayed).toBe(true);
    expect(auditIdOf(second.outcome)).toBe(auditIdOf(first.outcome));
    expect(auditStats().total).toBe(rowsAfterFirst);
    expect(auditTrailFor("widget", "w_oid_replay")).toHaveLength(1);
  });

  it("replay of a pending approval returns the stored auditId without a second row", () => {
    makeWidget("w_oid_replay_pending", 1000);
    const intent = spend("w_oid_replay_pending", 500);

    const first = executeIntent(kycReviewer, intent);
    const second = executeIntent(kycReviewer, intent);

    expect(first.outcome.status).toBe("pending_approval");
    expect(second.replayed).toBe(true);
    expect(auditIdOf(second.outcome)).toBe(auditIdOf(first.outcome));
    expect(auditTrailFor("widget", "w_oid_replay_pending")).toHaveLength(1);
  });
});
