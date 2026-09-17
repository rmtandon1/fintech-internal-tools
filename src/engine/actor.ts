import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Actor, Role } from "@/engine/types";
import { ROLES } from "@/engine/types";

export const ACTOR_COOKIE = "ops_actor";

/** Demo actors. Real deployments would resolve these from an identity provider. */
export const DEMO_ACTORS: Record<Role, Actor> = {
  analyst: { id: "usr_analyst", name: "Analyst", role: "analyst" },
  manager: { id: "usr_manager", name: "Manager", role: "manager" },
  admin: { id: "usr_admin", name: "Admin", role: "admin" },
};

export const DEFAULT_ACTOR = DEMO_ACTORS.analyst;

let devSecret: string | null = null;

/**
 * Role switching is a demo convenience, not authentication, so the cookie
 * only needs to resist casual editing. ACTOR_COOKIE_SECRET is used when set;
 * otherwise the key is random per process rather than a published constant.
 */
function secret(): string {
  const configured = process.env.ACTOR_COOKIE_SECRET;
  if (configured) return configured;
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
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
