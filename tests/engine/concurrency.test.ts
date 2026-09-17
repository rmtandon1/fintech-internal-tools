import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { setConstant } from "@/engine/policy/set-constant";
import { APPROVAL_THRESHOLD_KEY } from "../fixtures/widgets";
import {
  admin,
  analyst,
  makeWidget,
  setupHarness,
  widgetBalance,
} from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  // Keep the race about concurrency, not about approval.
  setConstant(admin, APPROVAL_THRESHOLD_KEY, "1000");
});

describe("concurrent writes against one record", () => {
  it("lets exactly one of ten overlapping spends through", async () => {
    makeWidget("w_race", 100);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.resolve().then(() =>
          executeIntent(analyst, {
            tool: "widgets",
            action: "spend",
            recordId: "w_race",
            input: { amount: 80, reason: "race" },
            idempotencyKey: ulid(),
          }),
        ),
      ),
    );

    const applied = results.filter((r) => r.outcome.status === "applied");
    const failed = results.filter((r) => r.outcome.status !== "applied");

    expect(applied).toHaveLength(1);
    expect(failed).toHaveLength(9);
    // Every failure is a clean, explained refusal — not a partial write.
    for (const result of failed) {
      expect(["denied", "error"]).toContain(result.outcome.status);
    }
    expect(widgetBalance("w_race")).toBe(20);
  });
});
