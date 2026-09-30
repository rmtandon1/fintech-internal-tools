import { describe, expect, it } from "vitest";
import type { ConstantRow } from "@console/engine/policy/constants";
import { COMPANIES_HOUSE_CHECK, REFUND_CLUSTERING_HOLD, type DevinRun } from "@console/tool-automation";
import { CLUSTERING_WINDOW_DAYS_KEY, MANAGER_APPROVAL_USD_KEY, refundTool } from "@console/tool-refunds";
import { buildRuleRows, isOn, specShortName } from "@/lib/rules-panel";

function run(overrides: Partial<DevinRun>): DevinRun {
  return {
    id: "01RUN",
    operation: "change",
    spec: REFUND_CLUSTERING_HOLD.file,
    tool: "refunds",
    intent: REFUND_CLUSTERING_HOLD.intents.change,
    contextSha256: "0".repeat(64),
    sessionId: null,
    sessionUrl: null,
    status: "merged",
    prUrl: "https://github.com/o/r/pull/42",
    mergeCommit: "d".repeat(40),
    reverses: null,
    requestedBy: "usr_manager",
    requestedByRole: "manager",
    approvedBy: "usr_engineer",
    lastNote: null,
    requestedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    version: 1,
    ...overrides,
  };
}

function constant(key: string, value: ConstantRow["value"], tool = "refunds"): ConstantRow {
  return { key, value, type: typeof value === "number" ? "number" : "boolean", description: `${key} desc`, tool, updatedAt: 1, updatedBy: "usr_admin" };
}

const declared = refundTool.constants ?? [];

describe("rules panel rows", () => {
  it("names a spec by its file", () => {
    expect(specShortName(REFUND_CLUSTERING_HOLD.file)).toBe("Refund clustering hold");
    expect(specShortName(COMPANIES_HOUSE_CHECK.file)).toBe("Companies house check");
  });

  it("reads 0, false and an empty list as Off", () => {
    expect(isOn(0)).toBe(false);
    expect(isOn(7)).toBe(true);
    expect(isOn(false)).toBe(false);
    expect(isOn([])).toBe(false);
    expect(isOn(["GB"])).toBe(true);
  });

  it("lists what the code declares with live values and drops database rows the code no longer declares", () => {
    const rows = buildRuleRows(refundTool, [constant(MANAGER_APPROVAL_USD_KEY, 999), constant("refunds.gone", 3)], []);
    expect(rows.map((r) => r.key)).toEqual(declared.map((c) => c.key));
    expect(rows.find((r) => r.key === MANAGER_APPROVAL_USD_KEY)).toMatchObject({ value: 999, declared: true, devin: null });
    expect(rows.map((r) => r.key)).not.toContain("refunds.gone");
    // A declared setting not yet registered shows the code's default and no editor row.
    const unregistered = rows.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY);
    expect(unregistered?.constant).toBeNull();
    expect(unregistered?.value).toBe(declared.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY)?.value);
  });

  it("marks a merged change run's switch setting as a live rule Devin added, on or off by its value", () => {
    const merged = run({});
    const on = buildRuleRows(refundTool, [constant(CLUSTERING_WINDOW_DAYS_KEY, 30)], [merged]);
    expect(on.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY)).toMatchObject({
      on: true,
      devin: {
        name: "Refund clustering hold",
        runId: "01RUN",
        spec: REFUND_CLUSTERING_HOLD.file,
        prNumber: 42,
        prUrl: "https://github.com/o/r/pull/42",
        askedBy: "Manager",
        state: { kind: "live" },
      },
    });
    const off = buildRuleRows(refundTool, [constant(CLUSTERING_WINDOW_DAYS_KEY, 0)], [merged]);
    expect(off.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY)?.on).toBe(false);
    // Only a merged change counts; an in-flight or stopped run adds nothing yet.
    for (const status of ["running", "approved", "stopped"]) {
      const rows = buildRuleRows(refundTool, [], [run({ status })]);
      expect(rows.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY)?.devin).toBeNull();
    }
    // A merged run for another tool never shows on this page.
    expect(
      buildRuleRows(refundTool, [], [run({ spec: COMPANIES_HOUSE_CHECK.file, tool: "kyc" })]).every((r) => r.devin === null),
    ).toBe(true);
  });

  it("shows removal in review while an undo is in flight and Removed · PR #N after it merges, keeping the row when the setting is gone", () => {
    const merged = run({});
    const undoing = run({ id: "01UNDO", operation: "undo", status: "running", reverses: "01RUN", prUrl: null, mergeCommit: null, requestedAt: 1_700_000_100_000 });
    const inReview = buildRuleRows(refundTool, [constant(CLUSTERING_WINDOW_DAYS_KEY, 30)], [merged, undoing]);
    expect(inReview.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY)?.devin?.state).toEqual({
      kind: "removal_in_review",
      runId: "01UNDO",
    });

    const undone = { ...undoing, status: "merged", prUrl: "https://github.com/o/r/pull/57", mergeCommit: "e".repeat(40) };
    const removed = buildRuleRows(refundTool, [constant(CLUSTERING_WINDOW_DAYS_KEY, 30)], [merged, undone]);
    expect(removed.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY)?.devin?.state).toEqual({
      kind: "removed",
      runId: "01UNDO",
      prNumber: 57,
      prUrl: "https://github.com/o/r/pull/57",
    });

    // Once the undo is pulled the code no longer declares the setting; the row stays, struck through.
    const withoutSetting = { ...refundTool, constants: declared.filter((c) => c.key !== CLUSTERING_WINDOW_DAYS_KEY) };
    const gone = buildRuleRows(withoutSetting, [], [merged, undone]);
    const row = gone.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY);
    expect(row).toMatchObject({ declared: false, on: false, devin: { state: { kind: "removed", prNumber: 57 } } });
    expect(gone.indexOf(row!)).toBe(gone.length - 1);
    // A stopped undo leaves the rule live.
    const abandoned = buildRuleRows(refundTool, [], [merged, { ...undoing, status: "stopped" }]);
    expect(abandoned.find((r) => r.key === CLUSTERING_WINDOW_DAYS_KEY)?.devin?.state).toEqual({ kind: "live" });
  });
});
