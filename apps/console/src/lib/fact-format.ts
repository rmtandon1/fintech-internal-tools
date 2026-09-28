import { formatMinorUnits, formatTimestamp, humanize } from "@console/ui/format";

export type FactValue = string | number | boolean | null;

/** Fact key → code → display label, built on the server from the tool's declarations. */
export type FactLabels = Record<string, Record<string, string>>;

/** snake_case / lowercase code, at least one letter: `pending_review`, `high`; not `GB`, not `12345678`, not "clear: ... (source)". */
const CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
/** A code leading a sentence, as in a check result: `needs_review: two of three…`. */
const CODE_PREFIX = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)*):(?=\s)/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** How a fact reads in the evidence list; the context.json value itself is untouched. */
export function factValue(labels: FactLabels, key: string, value: FactValue): string {
  if (value === null) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number")
    return key.endsWith("Minor") ? formatMinorUnits(value, "USD") : String(value);
  if (ISO_TIMESTAMP.test(value)) return formatTimestamp(Date.parse(value));
  if (CODE.test(value)) return labels[key]?.[value] ?? humanize(value);
  return value.replace(CODE_PREFIX, (_, code: string) => `${humanize(code)}:`);
}

/** camelCase fact names as plain words: `registrationNumber` → "registration number". */
export function factLabel(key: string): string {
  return key
    .replace(/Minor$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}
