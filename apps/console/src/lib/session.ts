import { cookies } from "next/headers";
import { ACTOR_COOKIE, actorFromCookie, verifyRoleCookie } from "@console/engine/actor";
import type { Actor, Role } from "@console/engine/types";

/** The current demo actor, resolved from the signed role cookie. */
export async function currentActor(): Promise<Actor> {
  const store = await cookies();
  return actorFromCookie(store.get(ACTOR_COOKIE)?.value);
}

/**
 * The role the person picked, or null before they pick one (or when the
 * cookie was signed by another checkout). The header then asks for a role.
 */
export async function chosenRole(): Promise<Role | null> {
  const store = await cookies();
  return verifyRoleCookie(store.get(ACTOR_COOKIE)?.value);
}
