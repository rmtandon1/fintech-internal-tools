import "@/app/bootstrap";
import type { ConsoleStatus } from "@/lib/connection";
import { devinStatus } from "@/lib/devin-status";

export const dynamic = "force-dynamic";

/**
 * `GET /api/status`: the header's live connection check. Reports Devin's mode
 * and reachability; no keys, hashes or organisation ids.
 */
export async function GET(): Promise<Response> {
  const devin = await devinStatus();
  const body: ConsoleStatus = {
    devin: { mode: devin.mode, error: devin.error },
    checkedAt: Date.now(),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
