import type { Actor, FieldDecl, ToolDeclaration } from "@/engine/types";

export const MASK = "••••";

export function maskValue(value: unknown, revealTail = 4): string {
  if (value === null || value === undefined || value === "") return MASK;
  const text = String(value);
  if (revealTail <= 0 || text.length <= revealTail) return MASK;
  return `${MASK} ${text.slice(-revealTail)}`;
}

export interface MaskedRecord {
  values: Record<string, unknown>;
  /** Fields whose value was replaced by a mask for this actor. */
  maskedFields: string[];
  canReveal: boolean;
}

/**
 * Applies masking at the read boundary: a PII field never leaves the server
 * in clear text unless it was explicitly revealed through `revealField`.
 */
export function maskRecord(
  decl: Pick<ToolDeclaration, "fields" | "revealRoles">,
  record: Record<string, unknown>,
  actor: Actor,
  revealed: string[] = [],
): MaskedRecord {
  const canReveal = decl.revealRoles.includes(actor.role);
  const values: Record<string, unknown> = { ...record };
  const maskedFields: string[] = [];

  for (const field of decl.fields) {
    if (!field.isPII) continue;
    if (revealed.includes(field.name) && canReveal) continue;
    values[field.name] = maskValue(record[field.name], field.revealTail ?? 4);
    maskedFields.push(field.name);
  }

  return { values, maskedFields, canReveal };
}

export function isPIIField(fields: FieldDecl[], name: string): boolean {
  return fields.some((f) => f.name === name && f.isPII);
}
