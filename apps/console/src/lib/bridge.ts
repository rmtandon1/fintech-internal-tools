import { resolve } from "node:path";
import {
  httpDevinClient,
  httpGitHubClient,
  replayDevinClient,
  replayGitHubClient,
} from "@console/tool-automation";
import type { BridgeDeps } from "@console/tool-automation/bridge";

export type BridgeMode = "live" | "replay";

export interface AppBridgeDeps extends BridgeDeps {
  mode: BridgeMode;
}

/**
 * Credentials for the Devin and GitHub APIs are read here, on the server,
 * and nowhere else. Without a Devin key the bridge runs on scripted replay
 * clients, so a run still moves through the same intents; without a GitHub
 * token in live mode, `github` stays null and approval reports that GitHub
 * is unconfigured.
 */
export function bridgeDeps(): AppBridgeDeps {
  const apiKey = process.env.DEVIN_API_KEY;
  const orgId = process.env.DEVIN_ORG_ID;
  const token = process.env.GITHUB_TOKEN;
  const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init);
  const repoRoot = process.env.REPO_ROOT ?? resolve(process.cwd(), "../..");
  if (apiKey && orgId) {
    return {
      mode: "live",
      devin: httpDevinClient({ apiKey, orgId, baseUrl: process.env.DEVIN_API_BASE }, fetchImpl),
      github: token ? httpGitHubClient(token, fetchImpl, process.env.GITHUB_API_BASE) : null,
      repoRoot,
      replaysDir: resolve(repoRoot, "apps/console/data/replays"),
      playbookId: process.env.DEVIN_PLAYBOOK_ID,
    };
  }
  return {
    mode: "replay",
    devin: replayDevinClient(),
    github: replayGitHubClient(),
    repoRoot,
    replaysDir: resolve(repoRoot, "apps/console/data/replays"),
    playbookId: process.env.DEVIN_PLAYBOOK_ID,
  };
}

/** Whether the server's runs go to api.devin.ai or play a scripted session. */
export function bridgeMode(): BridgeMode {
  return process.env.DEVIN_API_KEY && process.env.DEVIN_ORG_ID ? "live" : "replay";
}
