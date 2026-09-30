import type { ConstantRow } from "@console/engine/policy/constants";
import type { ToolDeclaration } from "@console/engine/types";
import { roleLabel } from "@console/permissions";
import type { DevinRun } from "@console/tool-automation";
import { getSpec, isInFlight } from "@console/tool-automation";
import { prNumberFromUrl } from "@console/tool-automation/removal-preview";

/** Where a rule Devin added stands: live, being removed, or removed. */
export type DevinRuleState =
  | { kind: "live" }
  | { kind: "removal_in_review"; runId: string }
  | { kind: "removed"; runId: string; prNumber: number | null; prUrl: string | null };

export interface DevinRuleInfo {
  /** The spec's short name, e.g. "Refund clustering hold". */
  name: string;
  /** The merged change run that added the rule, and its spec file. */
  runId: string;
  spec: string;
  prNumber: number | null;
  prUrl: string | null;
  /** Who asked for it, as a role label. */
  askedBy: string;
  state: DevinRuleState;
}

/** One row of a tool page's Rules panel. */
export interface RuleRow {
  key: string;
  description: string;
  /** The live database row, or null before the setting has been registered. */
  constant: ConstantRow | null;
  /** The setting's value: the database's, else the code's default. */
  value: number | string[] | boolean;
  /** False when the value is 0, false or empty: the rule is off. */
  on: boolean;
  /** Whether the tool's current code declares the setting. */
  declared: boolean;
  /** Set when a merged change run's `switchSetting` is this key. */
  devin: DevinRuleInfo | null;
}

/** `REFUND_CLUSTERING_HOLD.md` → "Refund clustering hold". */
export function specShortName(file: string): string {
  const stem = file.replace(/\.md$/i, "").replace(/_/g, " ").toLowerCase();
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export function isOn(value: number | string[] | boolean): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== 0 && value !== false;
}

function devinRules(tool: string, runs: readonly DevinRun[]): Map<string, DevinRuleInfo> {
  const rules = new Map<string, DevinRuleInfo>();
  // Newest first, so the latest merged change owns a setting.
  const merged = [...runs]
    .filter((run) => run.status === "merged" && run.operation === "change")
    .sort((a, b) => b.requestedAt - a.requestedAt);
  for (const run of merged) {
    const spec = getSpec(run.spec);
    if (!spec?.switchSetting || spec.tool !== tool || rules.has(spec.switchSetting)) continue;
    const reversal = runs.find(
      (r) => r.reverses === run.id && (r.status === "merged" || isInFlight(r.status)),
    );
    const state: DevinRuleState =
      reversal?.status === "merged"
        ? {
            kind: "removed",
            runId: reversal.id,
            prNumber: prNumberFromUrl(reversal.prUrl),
            prUrl: reversal.prUrl,
          }
        : reversal
          ? { kind: "removal_in_review", runId: reversal.id }
          : { kind: "live" };
    rules.set(spec.switchSetting, {
      name: spec.ruleName ?? specShortName(spec.file),
      runId: run.id,
      spec: spec.file,
      prNumber: prNumberFromUrl(run.prUrl),
      prUrl: run.prUrl,
      askedBy: roleLabel(run.requestedByRole),
      state,
    });
  }
  return rules;
}

/**
 * The settings a tool page lists: what the tool's current code declares, with
 * live values, then rules Devin added that a merged undo has since removed
 * (kept so the page still tells the story). Database rows the code no longer
 * declares are left out.
 */
export function buildRuleRows(
  decl: Pick<ToolDeclaration, "name" | "constants">,
  constants: readonly ConstantRow[],
  runs: readonly DevinRun[],
): RuleRow[] {
  const byKey = new Map(constants.map((row) => [row.key, row]));
  const devin = devinRules(decl.name, runs);
  const rows: RuleRow[] = (decl.constants ?? []).map((def) => {
    const constant = byKey.get(def.key) ?? null;
    const value = constant?.value ?? def.value;
    return {
      key: def.key,
      description: constant?.description ?? def.description,
      constant,
      value,
      on: isOn(value),
      declared: true,
      devin: devin.get(def.key) ?? null,
    };
  });
  const declared = new Set(rows.map((row) => row.key));
  for (const [key, info] of devin) {
    if (declared.has(key) || info.state.kind !== "removed") continue;
    const constant = byKey.get(key) ?? null;
    rows.push({
      key,
      description: constant?.description ?? "",
      constant,
      value: constant?.value ?? 0,
      on: false,
      declared: false,
      devin: info,
    });
  }
  return rows;
}
