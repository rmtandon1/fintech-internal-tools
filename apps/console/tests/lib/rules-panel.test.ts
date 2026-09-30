import { describe, expect, it } from "vitest";
import type { ConstantRow } from "@console/engine/policy/constants";
import { COMPANIES_HOUSE_CHECK, REFUND_CLUSTERING_HOLD, type DevinRun } from "@console/tool-automation";
import { MANAGER_APPROVAL_USD_KEY, refundTool } from "@console/tool-refunds";
import { buildRuleRows, findingRule, formatUsdMinor, isOn, keyLabel, specShortName } from "@/lib/rules-panel";
import type { ToolDeclaration } from "@console/engine/types";

/** The refund hold's on/off switch, as its spec names it. */
const SWITCH = REFUND_CLUSTERING_HOLD.switchSetting ?? "refunds.clustering_hold";

/**
 * The refunds tool as it stands once the refund hold has merged: the hold
 * declares its switch, off by default. Declared here so these tests don't
 * depend on the hold being in the codebase.
 */
const refunds: ToolDeclaration = {
  ...refundTool,
  adminActions: [{ label: "Recheck now", action: "recheck", setting: SWITCH }],
  constants: [
    ...(refundTool.constants ?? []).filter((c) => c.key !== SWITCH),
    {
      key: SWITCH,
      value: false,
      type: "boolean",
      description: "Holds a merchant's not-received refunds for a manager once together they pass the manager limit.",
      tool: "refunds",
    },
  ],
};

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

const declared = refunds.constants ?? [];

describe("rules panel rows", () => {
  it("names a spec by its file and a setting by its label, else its key read as words", () => {
    expect(specShortName(REFUND_CLUSTERING_HOLD.file)).toBe("Refund clustering hold");
    expect(specShortName(COMPANIES_HOUSE_CHECK.file)).toBe("Companies house check");
    expect(keyLabel("refunds.clustering_window_days")).toBe("Clustering window days");
    expect(formatUsdMinor(50_000)).toBe("$500.00");
    expect(formatUsdMinor(188_050)).toBe("$1,880.50");
  });

  it("reads 0, false and an empty list as Off", () => {
    expect(isOn(0)).toBe(false);
    expect(isOn(7)).toBe(true);
    expect(isOn(false)).toBe(false);
    expect(isOn([])).toBe(false);
    expect(isOn(["GB"])).toBe(true);
  });

  it("lists what the code declares with live values, labels and units, and drops database rows the code no longer declares", () => {
    const rows = buildRuleRows(refunds, [constant(MANAGER_APPROVAL_USD_KEY, 999), constant("refunds.gone", 3)], []);
    expect(rows.map((r) => r.key)).toEqual(declared.map((c) => c.key));
    expect(rows.find((r) => r.key === MANAGER_APPROVAL_USD_KEY)).toMatchObject({
      label: "Manager approval limit",
      unit: "usd_minor",
      description: "Refunds of this amount or more need a manager's approval.",
      value: 999,
      declared: true,
      devin: null,
      actions: [],
    });
    expect(rows.map((r) => r.key)).not.toContain("refunds.gone");
    // A declared setting not yet registered shows the code's default and no editor row.
    const unregistered = rows.find((r) => r.key === SWITCH);
    expect(unregistered?.constant).toBeNull();
    expect(unregistered?.value).toBe(declared.find((c) => c.key === SWITCH)?.value);
    expect(unregistered?.actions).toEqual(refunds.adminActions);
  });

  it("marks a merged change run's switch setting as a live rule Devin added, on or off by its value", () => {
    const merged = run({});
    const on = buildRuleRows(refunds, [constant(SWITCH, true)], [merged]);
    expect(on.find((r) => r.key === SWITCH)).toMatchObject({
      on: true,
      devin: {
        name: "Refund hold",
        runId: "01RUN",
        spec: REFUND_CLUSTERING_HOLD.file,
        prNumber: 42,
        prUrl: "https://github.com/o/r/pull/42",
        askedBy: "Manager",
        request: REFUND_CLUSTERING_HOLD.intents.change,
        askedAt: 1_700_000_000_000,
        state: { kind: "live" },
      },
    });
    const off = buildRuleRows(refunds, [constant(SWITCH, false)], [merged]);
    expect(off.find((r) => r.key === SWITCH)?.on).toBe(false);
    // Only a merged change counts; an in-flight or stopped run adds nothing yet.
    for (const status of ["running", "approved", "stopped"]) {
      const rows = buildRuleRows(refunds, [], [run({ status })]);
      expect(rows.find((r) => r.key === SWITCH)?.devin).toBeNull();
    }
    // A merged run for another tool never shows on this page.
    expect(
      buildRuleRows(refunds, [], [run({ spec: COMPANIES_HOUSE_CHECK.file, tool: "kyc" })]).every((r) => r.devin === null),
    ).toBe(true);
  });

  it("shows removal in review while an undo is in flight and removed · PR #N after it merges, keeping the row when the setting is gone", () => {
    const merged = run({});
    const undoing = run({ id: "01UNDO", operation: "undo", status: "running", reverses: "01RUN", prUrl: "https://github.com/o/r/pull/57", mergeCommit: null, requestedAt: 1_700_000_100_000 });
    const inReview = buildRuleRows(refunds, [constant(SWITCH, true)], [merged, undoing]);
    expect(inReview.find((r) => r.key === SWITCH)?.devin?.state).toEqual({
      kind: "removal_in_review",
      runId: "01UNDO",
      prNumber: 57,
      prUrl: "https://github.com/o/r/pull/57",
    });

    const undone = { ...undoing, status: "merged", mergeCommit: "e".repeat(40), updatedAt: 1_700_000_200_000 };
    const removed = buildRuleRows(refunds, [constant(SWITCH, true)], [merged, undone]);
    expect(removed.find((r) => r.key === SWITCH)?.devin?.state).toEqual({
      kind: "removed",
      runId: "01UNDO",
      prNumber: 57,
      prUrl: "https://github.com/o/r/pull/57",
      removedAt: 1_700_000_200_000,
    });

    // Once the undo is pulled the code no longer declares the setting; the row stays under Recently removed.
    const withoutSetting = { ...refunds, constants: declared.filter((c) => c.key !== SWITCH) };
    const gone = buildRuleRows(withoutSetting, [], [merged, undone]);
    const row = gone.find((r) => r.key === SWITCH);
    expect(row).toMatchObject({ declared: false, on: false, label: "Refund hold", devin: { state: { kind: "removed", prNumber: 57 } } });
    expect(gone.indexOf(row!)).toBe(gone.length - 1);
    // A stopped undo leaves the rule live.
    const abandoned = buildRuleRows(refunds, [], [merged, { ...undoing, status: "stopped" }]);
    expect(abandoned.find((r) => r.key === SWITCH)?.devin?.state).toEqual({ kind: "live" });
  });

  it("shows only the latest live card when the same switch is added again after a removal", () => {
    const first = run({});
    const undone = run({ id: "01UNDO", operation: "undo", status: "merged", reverses: "01RUN", prUrl: "https://github.com/o/r/pull/57", requestedAt: 1_700_000_100_000 });
    const again = run({ id: "01AGAIN", prUrl: "https://github.com/o/r/pull/61", requestedAt: 1_700_000_300_000 });
    const rows = buildRuleRows(refunds, [constant(SWITCH, false)], [first, undone, again]);
    const own = rows.filter((r) => r.key === SWITCH);
    expect(own).toHaveLength(1);
    expect(own[0].devin).toMatchObject({ runId: "01AGAIN", prNumber: 61, state: { kind: "live" } });
  });
});

describe("findingRule", () => {
  it("relates a finding to its spec: nothing, building, on or off", () => {
    expect(findingRule(refunds, REFUND_CLUSTERING_HOLD, [], [])).toEqual({ kind: "none" });
    expect(findingRule(refunds, REFUND_CLUSTERING_HOLD, [], [run({ status: "running" })])).toEqual({
      kind: "building",
      runId: "01RUN",
    });
    expect(findingRule(refunds, REFUND_CLUSTERING_HOLD, [constant(SWITCH, true)], [run({})])).toEqual({
      kind: "on",
      name: "Refund hold",
    });
    expect(findingRule(refunds, REFUND_CLUSTERING_HOLD, [constant(SWITCH, false)], [run({})])).toEqual({
      kind: "off",
      name: "Refund hold",
    });
    // With no database row yet the code's default decides.
    expect(findingRule(refunds, REFUND_CLUSTERING_HOLD, [], [run({})])).toEqual({ kind: "off", name: "Refund hold" });
    // A removed rule is no rule; a new change run for it is building again.
    const undone = run({ id: "01UNDO", operation: "undo", status: "merged", reverses: "01RUN", requestedAt: 1_700_000_100_000 });
    expect(findingRule(refunds, REFUND_CLUSTERING_HOLD, [], [run({}), undone])).toEqual({ kind: "none" });
    expect(
      findingRule(refunds, REFUND_CLUSTERING_HOLD, [], [run({}), undone, run({ id: "01AGAIN", status: "dispatched", requestedAt: 1_700_000_300_000 })]),
    ).toEqual({ kind: "building", runId: "01AGAIN" });
  });
});
