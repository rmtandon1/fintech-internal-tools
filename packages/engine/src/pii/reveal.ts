import { transact } from "@console/db-write";
import { resolveTool } from "../registry";
import { appendAudit } from "../audit/append";
import type { Actor } from "../types";

export type RevealResult =
  | { ok: true; field: string; value: string }
  | { ok: false; reason: string };

/**
 * Reveals one masked field. Permission is checked server-side and every
 * successful reveal writes an audit record, so looking at personal data is
 * itself a governed, evidenced event.
 */
export function revealField(
  actor: Actor,
  toolName: string,
  recordId: string,
  field: string,
): RevealResult {
  const decl = resolveTool(toolName);
  if (!decl) return { ok: false, reason: `No such tool: ${toolName}` };

  if (!decl.visibleTo.includes(actor.role)) {
    return { ok: false, reason: `Role ${actor.role} may not use ${decl.name}` };
  }

  const fieldDecl = decl.fields.find((f) => f.name === field);
  if (!fieldDecl?.isPII) {
    return { ok: false, reason: `${field} is not a personal data field` };
  }
  if (!decl.revealRoles.includes(actor.role)) {
    return { ok: false, reason: `Role ${actor.role} may not reveal personal data` };
  }

  const record = decl.get(recordId);
  if (!record) return { ok: false, reason: `No ${decl.recordType}: ${recordId}` };

  const value = record[field];
  transact((tx) =>
    appendAudit(tx, {
      actor,
      tool: decl.name,
      action: "reveal_pii",
      recordType: decl.recordType,
      recordId,
      event: "pii_revealed",
      summary: `Revealed ${fieldDecl.label} on ${recordId}`,
      payload: { field },
      before: null,
      after: null,
      decision: { effect: "allow", trace: [] },
    }),
  );

  return { ok: true, field, value: value === null || value === undefined ? "" : String(value) };
}
