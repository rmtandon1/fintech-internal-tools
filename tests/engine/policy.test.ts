import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { setConstant } from "@/engine/policy/set-constant";
import { APPROVAL_THRESHOLD_KEY } from "../fixtures/widgets";
import { admin, analyst, makeWidget, setupHarness } from "../helpers/harness";

beforeAll(() => setupHarness());

function spend(amount: number, recordId: string) {
  return executeIntent(analyst, {
    tool: "widgets",
    action: "spend",
    recordId,
    input: { amount, reason: "test" },
    idempotencyKey: ulid(),
  });
}

describe("policy precedence", () => {
  it("allows when every rule allows", () => {
    makeWidget("w_allow", 100);
    const result = spend(10, "w_allow");
    expect(result.outcome.status).toBe("applied");
  });

  it("requires approval when a rule asks for it", () => {
    makeWidget("w_approval", 1000);
    const result = spend(500, "w_approval");
    expect(result.outcome.status).toBe("pending_approval");
  });

  it("denies even when another rule only wants approval", () => {
    makeWidget("w_deny", 100);
    const result = spend(500, "w_deny");
    expect(result.outcome).toMatchObject({ status: "denied" });
    if (result.outcome.status !== "denied") throw new Error("expected denial");
    expect(result.outcome.trace).toHaveLength(2);
    expect(result.outcome.trace.map((t) => t.type)).toEqual([
      "deny",
      "require_approval",
    ]);
  });

  it("defaults to deny when an action declares no rules", () => {
    makeWidget("w_norules", 100);
    const result = executeIntent(analyst, {
      tool: "widgets",
      action: "rename_unruled",
      recordId: "w_norules",
      input: {},
      idempotencyKey: ulid(),
    });
    expect(result.outcome.status).toBe("denied");
  });

  it("refuses an action the role may not perform, server-side", () => {
    makeWidget("w_role", 100);
    const result = executeIntent(analyst, {
      tool: "widgets",
      action: "close",
      recordId: "w_role",
      input: {},
      idempotencyKey: ulid(),
    });
    expect(result.outcome).toMatchObject({ status: "error", code: "forbidden_role" });
  });

  it("reads thresholds from runtime constants on every evaluation", () => {
    makeWidget("w_constant", 1000);
    expect(spend(40, "w_constant").outcome.status).toBe("applied");

    setConstant(admin, APPROVAL_THRESHOLD_KEY, "10");
    expect(spend(40, "w_constant").outcome.status).toBe("pending_approval");

    setConstant(admin, APPROVAL_THRESHOLD_KEY, "50");
  });
});
