import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { analyst, makeWidget, manager, setupHarness, widgetBalance } from "../helpers/harness";

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

  it("rolls the reservation back with the effect when apply throws", () => {
    makeWidget("w_crash", 100);
    const intent = {
      tool: "widgets",
      action: "explode_now",
      recordId: "w_crash",
      input: {},
      idempotencyKey: ulid(),
    };

    const failed = executeIntent(analyst, intent);

    expect(failed.outcome).toMatchObject({ status: "error", code: "internal_error" });
    expect(widgetBalance("w_crash")).toBe(100);
    // The key is free again: a retry is not blocked by a stranded reservation.
    const retry = executeIntent(analyst, { ...intent, action: "spend", input: { amount: 10, reason: "retry" } });
    expect(retry.outcome.status).toBe("applied");
    expect(widgetBalance("w_crash")).toBe(90);
  });

  it("replays even once the record has left the action's allowed status", () => {
    makeWidget("w_closed", 100);
    const intent = {
      tool: "widgets",
      action: "close",
      recordId: "w_closed",
      input: {},
      idempotencyKey: ulid(),
    };

    const first = executeIntent(manager, intent);
    const retransmission = executeIntent(manager, intent);

    expect(first.outcome.status).toBe("applied");
    expect(retransmission.replayed).toBe(true);
    expect(retransmission.outcome).toEqual(first.outcome);
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

  it("reports a reused key as a conflict once the record has moved on", () => {
    makeWidget("w_reused", 100);
    const key = ulid();
    const spent = executeIntent(analyst, {
      tool: "widgets",
      action: "spend",
      recordId: "w_reused",
      input: { amount: 10, reason: "first" },
      idempotencyKey: key,
    });
    expect(spent.outcome.status).toBe("applied");
    executeIntent(manager, {
      tool: "widgets",
      action: "close",
      recordId: "w_reused",
      input: {},
      idempotencyKey: ulid(),
    });

    // "spend" no longer accepts a closed widget, but key reuse is the failure
    // the caller needs to hear about.
    const reused = executeIntent(analyst, {
      tool: "widgets",
      action: "spend",
      recordId: "w_reused",
      input: { amount: 25, reason: "different" },
      idempotencyKey: key,
    });

    expect(reused.outcome).toMatchObject({
      status: "error",
      code: "idempotency_conflict",
    });
  });
});
