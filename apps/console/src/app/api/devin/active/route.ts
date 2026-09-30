import "@/app/bootstrap";
import { bridgeDeps } from "@/lib/bridge";
import { handleActive } from "@/lib/devin-route";
import { currentActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The merge watcher's list of runs worth polling: everything in flight plus
 * merged runs not yet pulled into this checkout.
 */
export async function GET() {
  const actor = await currentActor();
  const result = await handleActive(actor, bridgeDeps());
  return Response.json(result.body, { status: result.status });
}
