import { describe, expect, it } from "vitest";
import { COMPANIES_HOUSE_CHECK, REFUND_CLUSTERING_HOLD, getSpec } from "@console/tool-automation";
import { sessionPrompt } from "@console/tool-automation/bridge";

const spec = getSpec("REFUND_CLUSTERING_HOLD.md");
const base = { branch: "demo", commit: "a".repeat(40) };

describe("sessionPrompt", () => {
  it("names the switch setting for a change, links the PR back to the run in the console, and leaves the merge to the engineer", () => {
    if (!spec) throw new Error("no spec");
    const prompt = sessionPrompt({
      runId: "RUN1",
      operation: "change",
      intent: "Hold them.",
      spec,
      repository: "owner/repo",
      base,
      consoleUrl: "http://localhost:3001/",
    });
    expect(prompt).toContain("Switch setting: refunds.clustering_hold.");
    expect(prompt).toContain("▶ [Open this change in the console](http://localhost:3001/t/automation/RUN1)");
    expect(prompt).toContain("Don't merge the pull request: an engineer reviews and merges it on GitHub.");
    expect(prompt).toContain("Branch from demo at aaaaaaa and open the pull request against demo.");
    expect(prompt).not.toContain("docs/DEVIN_RUN_PROTOCOL.md");
  });

  it("names no switch setting for an undo, and no console link without a console URL", () => {
    if (!spec) throw new Error("no spec");
    const prompt = sessionPrompt({ runId: "RUN2", operation: "undo", intent: "Undo it.", spec, base });
    expect(prompt).not.toContain("Switch setting:");
    expect(prompt).not.toContain("Open this change in the console");
  });

  it("names each rule's own switch setting in its change prompt", () => {
    for (const rule of [REFUND_CLUSTERING_HOLD, COMPANIES_HOUSE_CHECK]) {
      expect(rule.switchSetting).toBeTruthy();
      const prompt = sessionPrompt({ runId: "RUN3", operation: "change", intent: "x", spec: rule, base });
      expect(prompt).toContain(`Switch setting: ${rule.switchSetting}.`);
    }
  });
});
