import { cookies } from "next/headers";
import { ACTOR_COOKIE, actorFromCookie } from "@/engine/actor";
import type { Actor } from "@/engine/types";

/** The current demo actor, resolved from the signed role cookie. */
export async function currentActor(): Promise<Actor> {
  const store = await cookies();
  return actorFromCookie(store.get(ACTOR_COOKIE)?.value);
}
