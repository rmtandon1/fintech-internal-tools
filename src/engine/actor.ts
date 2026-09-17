import { createHmac, timingSafeEqual } from "node:crypto";
import type { Actor, Role } from "@/engine/types";
import { ROLES } from "@/engine/types";

export const ACTOR_COOKIE = "ops_actor";

/** Demo personas. Real deployments would resolve these from an identity provider. */
export const DEMO_ACTORS: Record<Role, Actor> = {
  analyst: { id: "usr_analyst_amara", name: "Amara Osei", role: "analyst" },
  manager: { id: "usr_manager_dan", name: "Dan Whitfield", role: "manager" },
  admin: { id: "usr_admin_priya", name: "Priya Raman", role: "admin" },
};

export const DEFAULT_ACTOR = DEMO_ACTORS.analyst;

function secret(): string {
  return process.env.ACTOR_COOKIE_SECRET ?? "demo-console-development-secret";
}

export function signRole(role: Role): string {
  const mac = createHmac("sha256", secret()).update(role).digest("hex");
  return `${role}.${mac}`;
}

export function verifyRoleCookie(value: string | undefined): Role | null {
  if (!value) return null;
  const [role, mac] = value.split(".");
  if (!role || !mac) return null;
  if (!ROLES.includes(role as Role)) return null;
  const expected = createHmac("sha256", secret()).update(role).digest("hex");
  const a = Buffer.from(mac, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return role as Role;
}

export function actorFromCookie(value: string | undefined): Actor {
  const role = verifyRoleCookie(value);
  return role ? DEMO_ACTORS[role] : DEFAULT_ACTOR;
}
