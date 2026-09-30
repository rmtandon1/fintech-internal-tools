import { describe, expect, it } from "vitest";
import {
  parseStepMessage,
  stepsComplete,
  withoutStepPrefix,
} from "@console/tool-automation/step-messages";
import { thinkingLine } from "@/lib/run-heading";

describe("parseStepMessage", () => {
  it("parses the step message the prompt asks for", () => {
    expect(parseStepMessage("Step 3 of 7 complete: Plan written")).toEqual({
      step: 3,
      total: 7,
      result: "Plan written",
    });
  });

  it("parses the older format that named the step before the result", () => {
    expect(parseStepMessage("Step 2 of 7 complete: Baseline: 120 tests")).toEqual({
      step: 2,
      total: 7,
      result: "Baseline: 120 tests",
    });
  });

  it("ignores case and surrounding whitespace", () => {
    expect(parseStepMessage("  step 4 of 7 COMPLETE:  Files edited  ")?.step).toBe(4);
  });

  it("returns null for a session that stopped, a non-complete line, and plain text", () => {
    expect(parseStepMessage("stopped")).toBeNull();
    expect(parseStepMessage("Step 7 of 7: Waiting for review")).toBeNull();
    expect(parseStepMessage("Running the baseline tests")).toBeNull();
  });
});

describe("stepsComplete", () => {
  it("is the furthest step reported, whatever order the messages arrived in", () => {
    expect(
      stepsComplete([
        "Step 4 of 7 complete: Files edited",
        "Step 2 of 7 complete: Baseline green",
        "Working on the edit",
      ]),
    ).toBe(4);
  });

  it("is 0 when nothing parses", () => {
    expect(stepsComplete([])).toBe(0);
    expect(stepsComplete(["Working…"])).toBe(0);
  });
});

describe("withoutStepPrefix", () => {
  it("drops the step prefix, leaving the result", () => {
    expect(withoutStepPrefix("Step 3 of 7 complete: Baseline: 120 tests")).toBe(
      "Baseline: 120 tests",
    );
  });

  it("leaves other text unchanged", () => {
    expect(withoutStepPrefix("Running the baseline tests")).toBe("Running the baseline tests");
  });
});

describe("thinkingLine", () => {
  it("shows the step message's result, not its prefix", () => {
    expect(thinkingLine(null, "Step 3 of 7 complete: Baseline: 120 tests")).toBe(
      "Baseline: 120 tests",
    );
  });
});
