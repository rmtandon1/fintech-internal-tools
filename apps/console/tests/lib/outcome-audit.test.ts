import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { approve } from "@console/engine/approvals";
import { auditTrailFor } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import type { Intent } from "@console/engine/types";
import { readOutcomeAudit } from "@/lib/outcome-audit";
import { kycManager, kycReviewer, makeWidget, setupHarness } from "../helpers/harness";

beforeAll(() => setupHarness());

function spend(recordId: string, amount: number, idempotencyKey = ulid()): Intent {
  return {
    tool: "widgets",
    action: "spend",
    recordId,
    input: { amount, reason: "outcome audit" },
    idempotencyKey,
  };
}

function approvalIdOf(result: ReturnType<typeof executeIntent>): string {
  if (result.outcome.status !== "pending_approval") throw new Error(result.outcome.status);
  return result.outcome.approvalId;
}

describe("readOutcomeAudit", () => {
  it("applied: reports the row's seq, hash, actor and masked snapshots", () => {
    makeWidget("w_oa_applied", 100);
    const result = executeIntent(kycReviewer, spend("w_oa_applied", 10));
    const audit = readOutcomeAudit(result, kycReviewer);
    const [row] = auditTrailFor("widget", "w_oa_applied");

    expect(audit).toMatchObject({
      seq: row.seq,
      rowHash: row.rowHash,
      ts: row.ts,
      actorId: kycReviewer.id,
      actorRole: kycReviewer.role,
      event: "applied",
      statusField: "status",
      frozenVersion: null,
      chainOk: true,
    });
    expect(audit?.before).toMatchObject({ balance: 100, version: 1 });
    expect(audit?.after).toMatchObject({ balance: 90, version: 2 });
    expect(audit?.before?.ownerEmail).not.toContain("w_oa_applied@example.com");
    expect(audit?.after?.ownerEmail).not.toContain("w_oa_applied@example.com");
  });

  it("pending_approval: reports the record as it stands and the frozen version", () => {
    makeWidget("w_oa_pending", 1000);
    const result = executeIntent(kycReviewer, spend("w_oa_pending", 500));
    const audit = readOutcomeAudit(result, kycReviewer);

    expect(audit).toMatchObject({ event: "approval_requested", frozenVersion: 1, after: null });
    expect(audit?.before).toMatchObject({ status: "open", version: 1 });
  });

  it("denied: reports the record as it stands with no after snapshot", () => {
    makeWidget("w_oa_denied", 5);
    const result = executeIntent(kycReviewer, spend("w_oa_denied", 10));
    const audit = readOutcomeAudit(result, kycReviewer);

    expect(audit).toMatchObject({ event: "denied", after: null });
    expect(audit?.before).toMatchObject({ balance: 5, version: 1 });
  });

  it("replayed approval: keeps the frozen version and claims nothing about current state", () => {
    makeWidget("w_oa_replay", 1000);
    const intent = spend("w_oa_replay", 500);
    const first = executeIntent(kycReviewer, intent);
    const approved = approve(kycManager, approvalIdOf(first));
    expect(approved.outcome.status).toBe("applied");

    const second = executeIntent(kycReviewer, intent);
    const audit = readOutcomeAudit(second, kycReviewer);

    expect(second.replayed).toBe(true);
    expect(audit).toMatchObject({
      seq: readOutcomeAudit(first, kycReviewer)?.seq,
      event: "approval_requested",
      frozenVersion: 1,
      before: null,
      after: null,
    });
  });

  it("error: has no audit row", () => {
    const result = executeIntent(kycReviewer, spend("w_oa_missing", 10));
    expect(result.outcome.status).toBe("error");
    expect(readOutcomeAudit(result, kycReviewer)).toBeNull();
  });
});
