import type { FieldDecl } from "@console/engine/types";

export function formatMinorUnits(minor: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(ts: number | null | undefined): string {
  if (!ts) return "—";
  const delta = Date.now() - ts;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatFieldValue(
  field: FieldDecl,
  record: Record<string, unknown>,
): string {
  const value = record[field.name];
  if (value === null || value === undefined || value === "") return "—";
  switch (field.type) {
    case "currency": {
      const currency = field.currencyField
        ? String(record[field.currencyField] ?? field.currency ?? "GBP")
        : (field.currency ?? "GBP");
      return typeof value === "number"
        ? formatMinorUnits(value, currency)
        : String(value);
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "enum":
      return field.enumLabels?.[String(value)] ?? humanize(String(value));
    case "date":
      return typeof value === "number"
        ? formatTimestamp(value)
        : String(value);
    default:
      return String(value);
  }
}

export function titleCase(value: string): string {
  return value
    .replace(/[_.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `not_received` → `Not received`: identifiers read as words, not code. */
export function humanize(value: string): string {
  const spaced = value.replace(/[_.]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
