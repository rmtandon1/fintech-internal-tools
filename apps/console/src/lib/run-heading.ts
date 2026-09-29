import type { RunViewPayload } from "@/lib/devin-route";
import { phaseLine } from "@/lib/run-checklist";

/** The Devin window's title for a run: the spec's business sentence for its operation. */
export function runTitle(payload: Pick<RunViewPayload, "summary">): string {
  return payload.summary;
}

/**
 * What Devin last said it is doing: its latest message in the session, else the
 * session's status detail, else its reported phase.
 */
export function thinkingLine(
  latest: RunViewPayload["latest"],
  devinMessage: string | null = null,
): string | null {
  return devinMessage ?? latest?.status_detail ?? phaseLine(latest?.structured_output ?? null);
}
