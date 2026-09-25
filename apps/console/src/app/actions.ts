"use server";

import "@/app/bootstrap";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { auditLog } from "@console/db-core/engine-schema";
import { ACTOR_COOKIE, signRole } from "@console/engine/actor";
import * as approvals from "@console/engine/approvals";
import { verifyChain } from "@console/engine/audit/verify";
import { executeIntent } from "@console/engine/execute-intent";
import { maskRecord } from "@console/engine/pii/mask";
import { setConstant } from "@console/engine/policy/set-constant";
import { revealField } from "@console/engine/pii/reveal";
import type { Actor, IntentResult, Role } from "@console/engine/types";
import { ROLES } from "@console/permissions";
import { currentActor } from "@/lib/session";
import { getTool } from "@/registry";

/** The audit row an outcome points at, masked like every other record read. */
export interface OutcomeAudit {
  seq: number;
  rowHash: string;
  ts: number;
  actorId: string;
  actorRole: string;
  event: string;
  /** The record before the write, or as the engine saw it when nothing was written. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  statusField: string;
  chainOk: boolean;
}

export interface SubmitResult extends IntentResult {
  audit?: OutcomeAudit;
}

export async function switchRole(role: string): Promise<void> {
  if (!ROLES.includes(role as Role)) return;
  const store = await cookies();
  store.set(ACTOR_COOKIE, signRole(role as Role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/", "layout");
}

export async function submitIntent(form: FormData): Promise<SubmitResult> {
  const actor = await currentActor();
  const tool = String(form.get("tool"));
  const action = String(form.get("action"));
  const recordId = form.get("recordId") ? String(form.get("recordId")) : null;
  const idempotencyKey = String(form.get("idempotencyKey") || ulid());

  // Inputs arrive as `input:<type>:<name>` so string fields that happen to
  // look numeric (document numbers, flag keys) survive the round trip. An
  // optional field is marked `input:<type>?:<name>`: blank means "not
  // supplied", so the schema default applies instead of a value the user never
  // chose. A blank required field is still sent, so "" reaches validation.
  const input: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("input:")) continue;
    const [, marker, name] = key.split(":");
    const optional = marker.endsWith("?");
    const type = optional ? marker.slice(0, -1) : marker;
    const raw = String(value);
    if (raw === "" && (optional || type === "number")) continue;
    input[name] = coerce(type, raw);
  }

  const result = executeIntent(actor, { tool, action, recordId, input, idempotencyKey });
  revalidatePath("/", "layout");
  if (result.outcome.status === "error") return result;
  const audit = readOutcomeAudit(result.outcome.auditId, actor);
  return audit ? { ...result, audit } : result;
}

function readOutcomeAudit(auditId: string, actor: Actor): OutcomeAudit | null {
  const row = db.select().from(auditLog).where(eq(auditLog.id, auditId)).get();
  const decl = row ? getTool(row.tool) : undefined;
  if (!row || !decl) return null;

  const mask = (record: Record<string, unknown> | null) =>
    record ? maskRecord(decl, record, actor).values : null;
  const before = parseRecord(row.beforeJson);
  const after = parseRecord(row.afterJson);
  // An approval request or a denial writes nothing, so the row carries no
  // snapshot; the record as it still stands is what the panel reports.
  const unchanged =
    !before && !after && row.recordId !== "-" ? decl.get(row.recordId) : null;

  return {
    seq: row.seq,
    rowHash: row.rowHash,
    ts: row.ts,
    actorId: row.actorId,
    actorRole: row.actorRole,
    event: row.event,
    before: mask(before ?? unchanged),
    after: mask(after),
    statusField: decl.statusField,
    chainOk: verifyChain().ok,
  };
}

function parseRecord(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  const parsed: unknown = JSON.parse(json);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

export async function approveRequest(id: string, note: string): Promise<IntentResult> {
  const actor = await currentActor();
  const result = approvals.approve(actor, id, note || undefined);
  revalidatePath("/", "layout");
  return result;
}

export async function rejectRequest(id: string, note: string): Promise<IntentResult> {
  const actor = await currentActor();
  const result = approvals.reject(actor, id, note);
  revalidatePath("/", "layout");
  return result;
}

export async function revealPii(tool: string, recordId: string, field: string) {
  const actor = await currentActor();
  const result = revealField(actor, tool, recordId, field);
  revalidatePath("/", "layout");
  return result;
}

export async function updateConstant(key: string, value: string) {
  const actor = await currentActor();
  const result = setConstant(actor, key, value);
  revalidatePath("/", "layout");
  return result;
}

function coerce(type: string, value: string): unknown {
  if (type === "number") return Number(value);
  if (type === "boolean") return value === "true" || value === "on";
  return value;
}
