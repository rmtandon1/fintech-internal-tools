import { devinStatus } from "@/lib/devin-status";

export const dynamic = "force-dynamic";

/**
 * `GET /api/devin/status`: whether a Devin key is configured, the mode the
 * console runs in and the organisation the key resolves to. The key itself is
 * never part of the response.
 */
export async function GET(): Promise<Response> {
  return Response.json(await devinStatus(), { headers: { "Cache-Control": "no-store" } });
}
