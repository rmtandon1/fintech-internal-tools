"use server";

import "@/app/bootstrap";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ulid } from "ulid";
import { ACTOR_COOKIE, signRole } from "@console/engine/actor";
import * as approvals from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { setConstant } from "@console/engine/policy/set-constant";
import { revealField } from "@console/engine/pii/reveal";
import type { IntentResult, Role } from "@console/engine/types";
import { ROLES } from "@console/permissions";
import { AUTOMATION_ROLES } from "@console/tool-automation";
import { OPS_MODES } from "@/lib/modes";
import { readOutcomeAudit, type OutcomeAudit } from "@/lib/outcome-audit";
import { getTool } from "@/registry";
import { currentActor } from "@/lib/session";

export interface SubmitResult extends IntentResult {
  audit?: OutcomeAudit;
}

export async function switchRole(role: string, pathname?: string): Promise<void> {
  if (!ROLES.includes(role as Role)) return;
  const store = await cookies();
  store.set(ACTOR_COOKIE, signRole(role as Role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/", "layout");
  // A tool page the new role can't see would 404; land somewhere useful.
  const tool = pathname?.match(/^\/t\/([^/]+)/)?.[1];
  const decl = tool ? getTool(tool) : undefined;
  if (decl && !decl.visibleTo.includes(role as Role)) {
    redirect(AUTOMATION_ROLES.includes(role as Role) ? "/runs" : "/");
  }
}

/** Opens an app from the home page as the role it is demonstrated with. */
export async function openApp(id: string): Promise<void> {
  const mode = OPS_MODES.find((m) => m.id === id);
  if (!mode) redirect("/");
  if (mode.launchRole) {
    const store = await cookies();
    store.set(ACTOR_COOKIE, signRole(mode.launchRole), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  revalidatePath("/", "layout");
  redirect(mode.href ?? `/t/${mode.id}`);
}

/** Clears the role, so the next person starts from the home page with none. */
export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(ACTOR_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
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
  const audit = readOutcomeAudit(result, actor);
  return audit ? { ...result, audit } : result;
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
