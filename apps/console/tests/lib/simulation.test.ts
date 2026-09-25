import { describe, expect, it } from "vitest";
import { REFUND_CLUSTERING_HOLD } from "@console/tool-automation";
import { allSimulations, defaultSimulation, simulatedRun, simulationsFor } from "@/lib/simulation";

describe("simulation mode scripts", () => {
  it("covers every kind the runnable spec offers", () => {
    for (const kind of REFUND_CLUSTERING_HOLD.kinds) {
      expect(simulatedRun(REFUND_CLUSTERING_HOLD.file, kind)?.sentences.length).toBeGreaterThan(0);
    }
    expect(simulatedRun("NO_SUCH_SPEC.md", "REVERSAL")).toBeNull();
    expect(Object.keys(simulationsFor(REFUND_CLUSTERING_HOLD.file, ["REVERSAL", "IMPLEMENTATION/CHANGE"]))).toEqual([
      "REVERSAL",
    ]);
  });

  it("shows a finished run: every checklist line done, guards and tests included", () => {
    for (const run of allSimulations()) {
      expect(run.checklist.length).toBeGreaterThan(0);
      expect(run.checklist.every((line) => line.state === "done")).toBe(true);
      expect(run.checklist.some((line) => line.label === "Running guards")).toBe(true);
      expect(run.checklist.find((line) => line.label === "Tests")?.detail).toMatch(/^\d+ → \d+$/);
    }
  });

  it("only names files inside the spec's scope", () => {
    for (const run of allSimulations()) {
      const paths = run.checklist
        .filter((line) => line.field === "files")
        .map((line) => line.label.replace(/^(Adding|Editing|Removing) /, ""));
      expect(paths.length).toBe(REFUND_CLUSTERING_HOLD.allowedPaths.length);
      for (const path of paths) expect(REFUND_CLUSTERING_HOLD.allowedPaths).toContain(path);
    }
  });

  it("claims no pull request or merge that does not exist", () => {
    for (const run of allSimulations()) {
      expect(run.checklist.some((line) => line.field === "pr_url" || line.field === "merge_commit")).toBe(false);
      expect(run.sentences.join(" ")).not.toMatch(/github\.com/);
    }
  });

  it("the reversal shows the conflict it resolved and the Only undo guard", () => {
    const reversal = simulatedRun(REFUND_CLUSTERING_HOLD.file, "REVERSAL");
    expect(reversal?.checklist.find((l) => l.field === "conflicts")?.detail).toContain("partial_delivery");
    expect(reversal?.checklist.find((l) => l.field === "guards")?.detail).toContain("Only undo");
    expect(defaultSimulation().kind).toBe("IMPLEMENTATION/ADDITION");
  });
});
