"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ulid } from "ulid";
import { ACTOR_COOKIE, signRole } from "@/engine/actor";
import * as approvals from "@/engine/approvals";
import { executeIntent } from "@/engine/execute-intent";
import { setConstant } from "@/engine/policy/set-constant";
import { revealField } from "@/engine/pii/reveal";
import type { IntentResult, Role } from "@/engine/types";
import { ROLES } from "@/engine/types";
import { currentActor } from "@/lib/session";

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

export async function submitIntent(form: FormData): Promise<IntentResult> {
  const actor = await currentActor();
  const tool = String(form.get("tool"));
  const action = String(form.get("action"));
  const recordId = form.get("recordId") ? String(form.get("recordId")) : null;
  const idempotencyKey = String(form.get("idempotencyKey") || ulid());

  // Inputs arrive as `input:<type>:<name>` so string fields that happen to
  // look numeric (document numbers, flag keys) survive the round trip.
  const input: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("input:")) continue;
    const [, type, name] = key.split(":");
    input[name] = coerce(type, String(value));
  }

  const result = executeIntent(actor, { tool, action, recordId, input, idempotencyKey });
  revalidatePath("/", "layout");
  return result;
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
  if (type === "number") return value === "" ? undefined : Number(value);
  if (type === "boolean") return value === "true" || value === "on";
  return value;
}
