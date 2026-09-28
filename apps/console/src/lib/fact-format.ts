import { getSpec } from "@console/tool-automation/specs";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { formatMinorUnits, formatTimestamp, humanize } from "@console/ui/format";

export type FactValue = string | number | boolean | null;

const TOOLS = [kycTool, refundTool];

/** snake_case / lowercase code, at least one letter: `pending_review`, `high`; not `GB`, not `12345678`, not "clear: ... (source)". */
const CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** The label the owning tool declares for a coded fact: its statuses when `key` is the status field, else an enum filter on `key`. */
function declaredLabel(tool: string, key: string, value: string): string | undefined {
  const decl = TOOLS.find((t) => t.name === tool);
  if (!decl) return undefined;
  if (key === decl.statusField) return decl.statuses.find((s) => s.value === value)?.label;
  return decl.filters
    .find((f) => f.type === "enum" && f.field === key)
    ?.options?.find((o) => o.value === value)?.label;
}

/** How a fact reads in the evidence list; the context.json value itself is untouched. */
export function factValue(spec: string, key: string, value: FactValue): string {
  if (value === null) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number")
    return key.endsWith("Minor") ? formatMinorUnits(value, "USD") : String(value);
  if (ISO_TIMESTAMP.test(value)) return formatTimestamp(Date.parse(value));
  if (CODE.test(value)) {
    const tool = getSpec(spec)?.evidence.tool;
    return (tool && declaredLabel(tool, key, value)) ?? humanize(value);
  }
  return value;
}

/** camelCase fact names as plain words: `registrationNumber` → "registration number". */
export function factLabel(key: string): string {
  return key
    .replace(/Minor$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}
