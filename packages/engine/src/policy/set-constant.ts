import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { runtimeConstants } from "@console/db-core/engine-schema";
import { transact } from "@console/db-write";
import { appendAudit } from "../audit/append";
import type { Actor } from "../types";

export type SetConstantResult =
  | { ok: true; key: string; before: unknown; after: unknown }
  | { ok: false; reason: string };

/**
 * Editing a policy threshold is itself a governed, audited action: admin only,
 * type-checked against the constant's declared type, and recorded with the
 * before/after values.
 */
export function setConstant(
  actor: Actor,
  key: string,
  rawValue: string,
): SetConstantResult {
  if (actor.role !== "admin") {
    return { ok: false, reason: "Only admins may change policy constants" };
  }

  const type = db
    .select({ type: runtimeConstants.type })
    .from(runtimeConstants)
    .where(eq(runtimeConstants.key, key))
    .get()?.type;
  if (!type) return { ok: false, reason: `No such constant: ${key}` };

  const parsed = parseValue(type, rawValue);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  // The previous value is read inside the transaction so the audited
  // transition is the one this write actually performed.
  const outcome = transact((tx) => {
    const row = tx
      .select()
      .from(runtimeConstants)
      .where(eq(runtimeConstants.key, key))
      .get();
    if (!row) return null;
    const before = JSON.parse(row.valueJson) as unknown;
    tx.update(runtimeConstants)
      .set({
        valueJson: JSON.stringify(parsed.value),
        updatedAt: Date.now(),
        updatedBy: actor.id,
      })
      .where(eq(runtimeConstants.key, key))
      .run();
    appendAudit(tx, {
      actor,
      tool: row.tool,
      action: "set_constant",
      recordType: "runtime_constant",
      recordId: key,
      event: "constant_changed",
      summary: `${key}: ${format(before)} → ${format(parsed.value)}`,
      payload: { key, value: parsed.value },
      before: { key, value: before },
      after: { key, value: parsed.value },
      decision: { effect: "allow", trace: [] },
    });
    return { before };
  });

  if (!outcome) return { ok: false, reason: `No such constant: ${key}` };
  return { ok: true, key, before: outcome.before, after: parsed.value };
}

function parseValue(
  type: "number" | "string_list" | "boolean",
  raw: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const text = raw.trim();
  if (type === "number") {
    const value = Number(text);
    if (!Number.isFinite(value)) return { ok: false, reason: `"${raw}" is not a number` };
    return { ok: true, value };
  }
  if (type === "boolean") {
    if (!["true", "false"].includes(text.toLowerCase())) {
      return { ok: false, reason: `"${raw}" is not true or false` };
    }
    return { ok: true, value: text.toLowerCase() === "true" };
  }
  const items = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ok: true, value: items };
}

function format(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}
