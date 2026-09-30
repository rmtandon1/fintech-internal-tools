import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { listAuditEvents } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { APPROVAL_THRESHOLD_KEY, SPEND_FEE_KEY } from "../fixtures/widgets";
import { admin, analyst, makeWidget, manager, setupHarness } from "../helpers/harness";

const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };

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

  it("refuses a write to a tool the role cannot see, whatever the action allows", () => {
    makeWidget("w_hidden", 100);
    const result = executeIntent(analyst, {
      tool: "vault",
      action: "close",
      recordId: "w_hidden",
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

describe("setConstant", () => {
  const managerKeys = new Set([APPROVAL_THRESHOLD_KEY]);

  it("lets a manager change a key named in managerKeys, audited with the before/after values", () => {
    setConstant(admin, APPROVAL_THRESHOLD_KEY, "50");
    const result = setConstant(manager, APPROVAL_THRESHOLD_KEY, "60", { managerKeys });
    expect(result).toEqual({ ok: true, key: APPROVAL_THRESHOLD_KEY, before: 50, after: 60 });

    const row = listAuditEvents({ recordId: APPROVAL_THRESHOLD_KEY, limit: 1 }).rows[0];
    expect(row?.action).toBe("set_constant");
    expect(row?.actorId).toBe(manager.id);
    expect(JSON.parse(row?.beforeJson ?? "null")).toEqual({ key: APPROVAL_THRESHOLD_KEY, value: 50 });
    expect(JSON.parse(row?.afterJson ?? "null")).toEqual({ key: APPROVAL_THRESHOLD_KEY, value: 60 });

    setConstant(admin, APPROVAL_THRESHOLD_KEY, "50");
  });

  it("denies a manager any key not named in managerKeys, or when none are named", () => {
    setConstant(admin, SPEND_FEE_KEY, "3");
    for (const options of [{ managerKeys }, {}]) {
      const result = setConstant(manager, SPEND_FEE_KEY, "9", options);
      expect(result).toEqual({ ok: false, reason: "Managers may only switch rules on and off" });
      expect(setConstant(admin, SPEND_FEE_KEY, "9").ok).toBe(true);
      setConstant(admin, SPEND_FEE_KEY, "3");
    }
  });

  it("denies analysts and engineers even when the key is in managerKeys", () => {
    for (const actor of [analyst, engineer]) {
      const result = setConstant(actor, APPROVAL_THRESHOLD_KEY, "10", { managerKeys });
      expect(result).toEqual({ ok: false, reason: "Only admins may change policy constants" });
    }
  });
});
