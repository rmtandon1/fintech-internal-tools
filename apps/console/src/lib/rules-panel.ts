import type { ConstantRow } from "@console/engine/policy/constants";
import type { AdminActionDecl, ConstantDefinition, ToolDeclaration } from "@console/engine/types";
import { roleLabel } from "@console/permissions";
import type { DevinRun, RunnableSpec } from "@console/tool-automation";
import { getSpec, isInFlight } from "@console/tool-automation";
import { prNumberFromUrl } from "@console/tool-automation/removal-preview";
import { formatDay, formatUsdMinor } from "@/lib/rule-format";

export { formatDay, formatUsdMinor };

/** Where a rule Devin added stands: live, being removed, or removed. */
export type DevinRuleState =
  | { kind: "live" }
  | { kind: "removal_in_review"; runId: string; prNumber: number | null; prUrl: string | null }
  | {
      kind: "removed";
      runId: string;
      prNumber: number | null;
      prUrl: string | null;
      /** When the removal merged. */
      removedAt: number;
    };

export interface DevinRuleInfo {
  /** The spec's rule name, e.g. "Refund hold". */
  name: string;
  /** The merged change run that added the rule, and its spec file. */
  runId: string;
  spec: string;
  prNumber: number | null;
  prUrl: string | null;
  /** Who asked for it, as a role label. */
  askedBy: string;
  /** What they asked for, in their words. */
  request: string;
  /** When they asked. */
  askedAt: number;
  state: DevinRuleState;
}

/** One row of a tool page's Rules panel. */
export interface RuleRow {
  key: string;
  /** What the screen calls the setting; the key stays in a tooltip. */
  label: string;
  description: string;
  type: ConstantDefinition["type"];
  unit: ConstantDefinition["unit"] | null;
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
  /** Tool-wide actions that belong to this rule. */
  actions: AdminActionDecl[];
}

/** `REFUND_CLUSTERING_HOLD.md` → "Refund clustering hold". */
export function specShortName(file: string): string {
  const stem = file.replace(/\.md$/i, "").replace(/_/g, " ").toLowerCase();
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/** `refunds.manager_approval_usd_minor` → "Manager approval usd minor", when no label is declared. */
export function keyLabel(key: string): string {
  const stem = key.slice(key.indexOf(".") + 1).replace(/_/g, " ");
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
            removedAt: reversal.updatedAt,
          }
        : reversal
          ? {
              kind: "removal_in_review",
              runId: reversal.id,
              prNumber: prNumberFromUrl(reversal.prUrl),
              prUrl: reversal.prUrl,
            }
          : { kind: "live" };
    rules.set(spec.switchSetting, {
      name: spec.ruleName ?? specShortName(spec.file),
      runId: run.id,
      spec: spec.file,
      prNumber: prNumberFromUrl(run.prUrl),
      prUrl: run.prUrl,
      askedBy: roleLabel(run.requestedByRole),
      request: run.intent,
      askedAt: run.requestedAt,
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
  decl: Pick<ToolDeclaration, "name" | "constants" | "adminActions">,
  constants: readonly ConstantRow[],
  runs: readonly DevinRun[],
): RuleRow[] {
  const byKey = new Map(constants.map((row) => [row.key, row]));
  const devin = devinRules(decl.name, runs);
  const actionsFor = (key: string) => (decl.adminActions ?? []).filter((a) => a.setting === key);
  const rows: RuleRow[] = (decl.constants ?? []).map((def) => {
    const constant = byKey.get(def.key) ?? null;
    const value = constant?.value ?? def.value;
    return {
      key: def.key,
      label: def.label ?? keyLabel(def.key),
      description: def.description,
      type: def.type,
      unit: def.unit ?? null,
      constant,
      value,
      on: isOn(value),
      declared: true,
      devin: devin.get(def.key) ?? null,
      actions: actionsFor(def.key),
    };
  });
  const declared = new Set(rows.map((row) => row.key));
  for (const [key, info] of devin) {
    if (declared.has(key) || info.state.kind !== "removed") continue;
    const constant = byKey.get(key) ?? null;
    rows.push({
      key,
      label: info.name,
      description: constant?.description ?? "",
      type: constant?.type ?? "boolean",
      unit: null,
      constant,
      value: constant?.value ?? false,
      on: false,
      declared: false,
      devin: info,
      actions: [],
    });
  }
  return rows;
}

/** Where a pattern finding stands against the spec that would handle it. */
export type FindingRule =
  | { kind: "none" }
  | { kind: "building"; runId: string }
  | { kind: "on"; name: string }
  | { kind: "off"; name: string };

/**
 * A finding's spec, read through the runs: a merged rule that is on or off
 * (by its switch setting's live value), a change run still in flight, or
 * nothing yet.
 */
export function findingRule(
  decl: Pick<ToolDeclaration, "name" | "constants">,
  spec: RunnableSpec,
  constants: readonly ConstantRow[],
  runs: readonly DevinRun[],
): FindingRule {
  const rule = spec.switchSetting ? devinRules(spec.tool, runs).get(spec.switchSetting) : undefined;
  if (rule && rule.spec === spec.file && rule.state.kind !== "removed" && spec.switchSetting) {
    const key = spec.switchSetting;
    const value =
      constants.find((row) => row.key === key)?.value ??
      (decl.constants ?? []).find((def) => def.key === key)?.value ??
      false;
    return { kind: isOn(value) ? "on" : "off", name: rule.name };
  }
  const building = runs.find(
    (run) => run.spec === spec.file && run.operation === "change" && isInFlight(run.status),
  );
  return building ? { kind: "building", runId: building.id } : { kind: "none" };
}
