import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted, no insignificant whitespace,
 * `undefined` dropped. Two structurally equal values always serialise equally,
 * which is what makes the audit hash chain reproducible.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value === undefined ? null : value;
  }
  if (Array.isArray(value)) return value.map(normalise);
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] === undefined) continue;
    out[key] = normalise(source[key]);
  }
  return out;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
