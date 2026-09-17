import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

const DEV_SECRET_PATH = resolve(
  process.env.ACTOR_COOKIE_SECRET_PATH ?? "data/.actor-secret",
);

/**
 * Role switching is a demo convenience, not authentication, so the cookie
 * only needs to resist casual editing. ACTOR_COOKIE_SECRET is used when set;
 * otherwise a generated key is cached on disk, because server actions and
 * page renders can run in different processes and must agree on the key.
 */
function secret(): string {
  const configured = process.env.ACTOR_COOKIE_SECRET;
  if (configured) return configured;
  if (devSecret) return devSecret;
  const existing = readSecretFile();
  if (existing) {
    devSecret = existing;
    return devSecret;
  }
  const candidate = randomBytes(32).toString("hex");
  mkdirSync(dirname(DEV_SECRET_PATH), { recursive: true });
  try {
    // Exclusive create: processes starting together must not each keep their
    // own candidate while the last writer decides what is on disk.
    writeFileSync(DEV_SECRET_PATH, candidate, { mode: 0o600, flag: "wx" });
    devSecret = candidate;
  } catch {
    devSecret = readSecretFile() ?? candidate;
  }
  return devSecret;
}

function readSecretFile(): string | null {
  try {
    return readFileSync(DEV_SECRET_PATH, "utf8").trim() || null;
  } catch {
    return null;
  }
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
