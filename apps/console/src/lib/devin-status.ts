import { type FetchLike, getSelf } from "@console/tool-automation";
import { loadRepoEnv } from "@/lib/env";

/**
 * `live` when `DEVIN_API_KEY` is set: dispatch opens real sessions. Otherwise
 * `simulation`: the console shows what a run would report, labelled as
 * simulated, and dispatch writes nothing.
 */
export type DevinMode = "live" | "simulation";

export interface DevinStatus {
  configured: boolean;
  mode: DevinMode;
  /** The organisation sessions are created in. */
  orgId: string | null;
  orgSource: "DEVIN_ORG_ID" | "key" | null;
  /** Who the key authenticates as, e.g. `service_user · Devin API`. */
  principal: string | null;
  /** Whether a GitHub token is set, which approval and merge checks need. */
  github: boolean;
  /** Why the key could not be checked; the mode stays `live`. */
  error: string | null;
}

type Env = Record<string, string | undefined>;

function serverEnv(): Env {
  loadRepoEnv();
  return process.env;
}

export function devinMode(env: Env = serverEnv()): DevinMode {
  return env.DEVIN_API_KEY ? "live" : "simulation";
}

const TTL_MS = 60_000;
/** A rejected or unreachable key is re-checked at most this often. */
const FAILURE_TTL_MS = 15_000;
let cached: { identity: string; until: number; status: DevinStatus } | null = null;

/**
 * Checks the key against `GET /v3/self`. The answer is cached per key, org
 * override and API base: a minute when it succeeds, fifteen seconds when it
 * fails, so a bad key can't turn every status request into an upstream call.
 * Never returns the key itself.
 */
export async function devinStatus(
  env: Env = serverEnv(),
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  now: number = Date.now(),
): Promise<DevinStatus> {
  const apiKey = env.DEVIN_API_KEY;
  const base = { github: Boolean(env.GITHUB_TOKEN) };
  if (!apiKey) {
    return {
      ...base,
      configured: false,
      mode: "simulation",
      orgId: null,
      orgSource: null,
      principal: null,
      error: null,
    };
  }
  const envOrg = env.DEVIN_ORG_ID || null;
  const identity = JSON.stringify([apiKey, envOrg, env.DEVIN_API_BASE ?? null]);
  if (cached && cached.identity === identity && now < cached.until) {
    return { ...cached.status, ...base };
  }
  try {
    const self = await getSelf(apiKey, fetchImpl, env.DEVIN_API_BASE);
    const orgId = envOrg ?? self.orgId;
    const status: DevinStatus = {
      ...base,
      configured: true,
      mode: "live",
      orgId,
      orgSource: envOrg ? "DEVIN_ORG_ID" : self.orgId ? "key" : null,
      principal: [self.principalType, self.name].filter(Boolean).join(" · "),
      error: orgId ? null : "The key is not scoped to an organisation; set DEVIN_ORG_ID",
    };
    cached = { identity, until: now + (orgId ? TTL_MS : FAILURE_TTL_MS), status };
    return status;
  } catch (error) {
    const status: DevinStatus = {
      ...base,
      configured: true,
      mode: "live",
      orgId: envOrg,
      orgSource: envOrg ? "DEVIN_ORG_ID" : null,
      principal: null,
      error: error instanceof Error ? error.message : String(error),
    };
    cached = { identity, until: now + FAILURE_TTL_MS, status };
    return status;
  }
}
