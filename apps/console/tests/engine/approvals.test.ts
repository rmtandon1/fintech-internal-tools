import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { approve, getApproval, listApprovals, reject } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { setConstant } from "@console/engine/policy/set-constant";
import { DEMO_ACTORS } from "@console/engine/actor";
import { TOOLS } from "@/registry";
import { APPROVAL_THRESHOLD_KEY, SPEND_FEE_KEY } from "../fixtures/widgets";
import {
  admin,
  kycReviewer,
  makeWidget,
  kycManager,
  otherManager,
  setupHarness,
  widgetBalance,
} from "../helpers/harness";

beforeAll(() => setupHarness());

function requestSpend(recordId: string, amount: number, actor = kycReviewer) {
  const result = executeIntent(actor, {
    tool: "widgets",
    action: "spend",
    recordId,
    input: { amount, reason: "needs a manager" },
    idempotencyKey: ulid(),
  });
  if (result.outcome.status !== "pending_approval") {
    throw new Error(`expected approval, got ${result.outcome.status}`);
  }
  return result.outcome.approvalId;
}

describe("approvals", () => {
  it("forbids engineer intents for every action in KYC, refunds, and flags", () => {
    for (const tool of TOOLS) {
      for (const action of tool.actions) {
        const result = executeIntent(DEMO_ACTORS.engineer, {
          tool: tool.name,
          action: action.name,
          recordId: "unauthorized",
          input: {},
          idempotencyKey: ulid(),
        });
        expect(result.outcome, `${tool.name}.${action.name}`).toMatchObject({
          status: "error",
          code: "forbidden_role",
        });
      }
    }
  });

  it("does not let an engineer approve or reject a pending request", () => {
    makeWidget("w_engineer", 1000);
    const id = requestSpend("w_engineer", 500);

    expect(approve(DEMO_ACTORS.engineer, id, "approve").outcome).toMatchObject({
      status: "error",
      code: "approval_not_pending",
    });
    expect(reject(DEMO_ACTORS.engineer, id, "reject").outcome).toMatchObject({
      status: "error",
      code: "approval_not_pending",
    });
    expect(getApproval(id)?.status).toBe("pending");
    expect(widgetBalance("w_engineer")).toBe(1000);
  });

  it("blocks self-approval at the database predicate", () => {
    makeWidget("w_self", 1000);
    const id = requestSpend("w_self", 500, kycManager);

    const result = approve(kycManager, id, "approving my own request");

    expect(result.outcome).toMatchObject({ status: "error", code: "self_approval" });
    expect(getApproval(id)?.status).toBe("pending");
    expect(widgetBalance("w_self")).toBe(1000);
  });

  it("executes the frozen payload, not a recomputed one", () => {
    makeWidget("w_frozen", 1000);
    const id = requestSpend("w_frozen", 500);

    // Moving the threshold after the fact must not change what was approved.
    setConstant(admin, APPROVAL_THRESHOLD_KEY, "900");
    const result = approve(kycManager, id, "ok");

    expect(result.outcome.status).toBe("applied");
    expect(widgetBalance("w_frozen")).toBe(500);
    setConstant(admin, APPROVAL_THRESHOLD_KEY, "50");
  });

  it("applies the decision frozen at request time, not one recomputed from current constants", () => {
    makeWidget("w_decision", 1000);
    const id = requestSpend("w_decision", 500);

    // The fee feeds `decide`, so a recomputed decision would spend 600.
    setConstant(admin, SPEND_FEE_KEY, "100");
    const result = approve(kycManager, id, "ok");

    expect(result.outcome.status).toBe("applied");
    expect(widgetBalance("w_decision")).toBe(500);
    setConstant(admin, SPEND_FEE_KEY, "0");
  });

  it("leaves nothing applied and nothing approved when the effect throws", () => {
    makeWidget("w_boom", 1000);
    const requested = executeIntent(kycReviewer, {
      tool: "widgets",
      action: "explode",
      recordId: "w_boom",
      input: {},
      idempotencyKey: ulid(),
    });
    if (requested.outcome.status !== "pending_approval") {
      throw new Error(`expected approval, got ${requested.outcome.status}`);
    }

    const result = approve(kycManager, requested.outcome.approvalId, "go");

    expect(result.outcome).toMatchObject({ status: "error", code: "internal_error" });
    // The claim and the partial write rolled back together.
    expect(getApproval(requested.outcome.approvalId)?.status).toBe("pending");
    expect(widgetBalance("w_boom")).toBe(1000);
  });

  it("fails safely when the record moved since the request was raised", () => {
    makeWidget("w_stale", 1000);
    const id = requestSpend("w_stale", 500);

    executeIntent(kycReviewer, {
      tool: "widgets",
      action: "spend",
      recordId: "w_stale",
      input: { amount: 10, reason: "sneaks in first" },
      idempotencyKey: ulid(),
    });

    const result = approve(kycManager, id, "too late");

    expect(result.outcome).toMatchObject({ status: "error", code: "version_conflict" });
    expect(getApproval(id)?.status).toBe("failed");
    expect(widgetBalance("w_stale")).toBe(990);
  });

  it("cannot be decided twice", () => {
    makeWidget("w_twice", 1000);
    const id = requestSpend("w_twice", 500);

    expect(approve(kycManager, id, "yes").outcome.status).toBe("applied");
    expect(approve(otherManager, id, "again").outcome).toMatchObject({
      status: "error",
      code: "approval_not_pending",
    });
  });

  it("records a rejection without touching the record", () => {
    makeWidget("w_reject", 1000);
    const id = requestSpend("w_reject", 500);

    const result = reject(kycManager, id, "not justified");

    expect(result.outcome.status).toBe("applied");
    if (result.outcome.status !== "applied") throw new Error("unreachable");
    expect(result.outcome.auditId).not.toBe("-");
    expect(widgetBalance("w_reject")).toBe(1000);
    expect(listApprovals("pending").some((a) => a.id === id)).toBe(false);
  });
});
