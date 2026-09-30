/**
 * Parses the "Step N of M complete: <result>" chat messages a run session
 * posts after each step. Client-safe: no imports, no server dependencies.
 */

const STEP_MESSAGE = /^\s*Step\s+(\d+)\s+of\s+(\d+)\s+complete:\s*([\s\S]*)$/i;

/** The step a "Step N of M complete" message reports, or null for anything else. */
export function parseStepMessage(
  text: string,
): { step: number; total: number; result: string } | null {
  const match = STEP_MESSAGE.exec(text);
  if (!match) return null;
  return { step: Number(match[1]), total: Number(match[2]), result: match[3].trim() };
}

/** The furthest step any of `messages` reports complete; 0 when none parse. */
export function stepsComplete(messages: readonly string[]): number {
  let done = 0;
  for (const text of messages) {
    const parsed = parseStepMessage(text);
    if (parsed) done = Math.max(done, parsed.step);
  }
  return done;
}

/**
 * `text` without its leading "Step N of M complete:" and any whitespace after
 * it; anything that is not a step message comes back unchanged.
 */
export function withoutStepPrefix(text: string): string {
  const parsed = parseStepMessage(text);
  return parsed ? parsed.result : text;
}
