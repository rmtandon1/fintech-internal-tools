import { describe, expect, it } from "vitest";
import { latestVerifySteps } from "../../src/lib/run-phases";

describe("latestVerifySteps", () => {
  it("keeps one row per gate and the last result reported for it", () => {
    expect(
      latestVerifySteps([
        { name: "Lint", pass: false },
        { name: "Typecheck", pass: true },
        { name: "Lint", pass: true },
        { name: "Test", pass: null, before: 68, after: null },
        { name: "Test", pass: true, before: 68, after: 70 },
      ]),
    ).toEqual([
      { name: "Lint", pass: true },
      { name: "Typecheck", pass: true },
      { name: "Test", pass: true, before: 68, after: 70 },
    ]);
  });

  it("returns unique gates unchanged", () => {
    const steps = [
      { name: "Lint", pass: true },
      { name: "Test", pass: true, before: 3, after: 3 },
    ];
    expect(latestVerifySteps(steps)).toEqual(steps);
  });
});
