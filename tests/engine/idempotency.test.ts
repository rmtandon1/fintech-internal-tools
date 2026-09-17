import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { analyst, makeWidget, setupHarness, widgetBalance } from "../helpers/harness";

beforeAll(() => setupHarness());

describe("idempotency", () => {
  it("replays the stored result for the same key and payload", () => {
    makeWidget("w_replay", 100);
    const key = ulid();
    const intent = {
      tool: "widgets",
      action: "spend",
      recordId: "w_replay",
      input: { amount: 10, reason: "first" },
      idempotencyKey: key,
    };

    const first = executeIntent(analyst, intent);
    const second = executeIntent(analyst, intent);

    expect(first.outcome.status).toBe("applied");
    expect(second.replayed).toBe(true);
    expect(second.outcome).toEqual(first.outcome);
    expect(widgetBalance("w_replay")).toBe(90);
  });

  it("rejects the same key with a different payload", () => {
    makeWidget("w_conflict", 100);
    const key = ulid();
    executeIntent(analyst, {
      tool: "widgets",
      action: "spend",
      recordId: "w_conflict",
      input: { amount: 10, reason: "first" },
      idempotencyKey: key,
    });

    const conflicting = executeIntent(analyst, {
      tool: "widgets",
      action: "spend",
      recordId: "w_conflict",
      input: { amount: 25, reason: "different" },
      idempotencyKey: key,
    });

    expect(conflicting.outcome).toMatchObject({
      status: "error",
      code: "idempotency_conflict",
    });
    expect(widgetBalance("w_conflict")).toBe(90);
  });
});
