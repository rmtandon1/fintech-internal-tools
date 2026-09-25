import "@/app/bootstrap";
import { bridgeDeps } from "@/lib/bridge";
import { handleGet, handlePost } from "@/lib/devin-route";
import { currentActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The browser's only window onto a run's session. Everything — poll, merge
 * observation, replies — goes through the server's bridge deps, so Devin and
 * GitHub credentials never leave the server.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const actor = await currentActor();
  const result = await handleGet(runId, actor, bridgeDeps());
  return Response.json(result.body, { status: result.status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const actor = await currentActor();
  const body: unknown = await request.json().catch(() => null);
  const result = await handlePost(runId, actor, bridgeDeps(), body);
  return Response.json(result.body, { status: result.status });
}
