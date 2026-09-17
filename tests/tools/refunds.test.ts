import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { registerConstants } from "@/engine/policy/register";
import type { Actor } from "@/engine/types";
import { refundTool } from "@/tools/refunds";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

function act(
  actor: Actor,
  action: string,
  recordId: string,
  input: Record<string, unknown> = {},
) {
  return executeIntent(actor, {
    tool: "refunds",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

describe("refunds", () => {
  it("sends a small refund straight to the processor", () => {
    const result = act(analyst, "execute", "rfnd_0001");
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0001")?.status).toBe("executing");
  });

  it("requires a manager above the USD-equivalent threshold", () => {
    const result = act(analyst, "execute", "rfnd_0003");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "amount_approval", tier: "manager" }),
    );
    expect(refundTool.get("rfnd_0003")?.status).toBe("requested");
  });

  it("requires an admin above the admin threshold", () => {
    const result = act(analyst, "execute", "rfnd_0004");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "amount_approval",
        tier: "admin",
        allowedRoles: ["admin"],
      }),
    );
  });

  it("holds a goodwill refund at its own lower threshold", () => {
    const result = act(analyst, "execute", "rfnd_0005");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "goodwill_approval", tier: "manager" }),
    );
  });

  it("denies a refund that would exceed the captured amount", () => {
    const result = act(manager, "execute", "rfnd_0006");
    if (result.outcome.status !== "denied") throw new Error("expected a denial");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "within_captured_amount", type: "deny" }),
    );
    expect(refundTool.get("rfnd_0006")?.status).toBe("requested");
  });

  it("denies a refund while a chargeback is open", () => {
    const result = act(admin, "execute", "rfnd_0007");
    if (result.outcome.status !== "denied") throw new Error("expected a denial");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "not_disputed", type: "deny" }),
    );
  });

  it("counts the money as refunded only on settlement", () => {
    const before = refundTool.get("rfnd_0008");
    expect(before?.refundedMinor).toBe(0);
    const result = act(manager, "mark_settled", "rfnd_0008", { reference: "re_77120" });
    expect(result.outcome.status).toBe("applied");
    const after = refundTool.get("rfnd_0008");
    expect(after?.status).toBe("settled");
    expect(after?.refundedMinor).toBe(before?.amountMinor);
    expect(after?.settledAt).toBeGreaterThan(0);
  });

  it("keeps settlement out of an analyst's hands", () => {
    const result = act(analyst, "mark_settled", "rfnd_0008", { reference: "re_00001" });
    expect(result.outcome).toMatchObject({ code: "forbidden_role" });
  });

  it("lets a failed refund be retried but not a settled one", () => {
    expect(act(analyst, "execute", "rfnd_0009").outcome.status).toBe("applied");
    expect(act(analyst, "execute", "rfnd_0010").outcome).toMatchObject({
      code: "invalid_status",
    });
  });

  it("replays an identical request instead of paying twice", () => {
    const key = ulid();
    const intent = {
      tool: "refunds",
      action: "execute",
      recordId: "rfnd_0002",
      input: {},
      idempotencyKey: key,
    };
    const first = executeIntent(analyst, intent);
    const second = executeIntent(analyst, intent);
    expect(first.outcome.status).toBe("applied");
    expect(second.replayed).toBe(true);
    expect(refundTool.get("rfnd_0002")?.version).toBe(2);
  });
});
