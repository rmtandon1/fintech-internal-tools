import { resolve } from "node:path";
import {
  httpDevinClient,
  httpGitHubClient,
  replayDevinClient,
  replayGitHubClient,
} from "@console/tool-automation";
import type { BridgeDeps } from "@console/tool-automation/bridge";

/**
 * Credentials for the Devin and GitHub APIs are read here, on the server,
 * and nowhere else. Without Devin credentials the console runs in Replay
 * mode: both clients play a recorded fixture and every surface says so.
 */
export function bridgeDeps(): BridgeDeps {
  const apiKey = process.env.DEVIN_API_KEY;
  const orgId = process.env.DEVIN_ORG_ID;
  const token = process.env.GITHUB_TOKEN;
  const repoRoot = process.env.REPO_ROOT ?? resolve(process.cwd(), "../..");
  const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init);
  if (!apiKey || !orgId) {
    return {
      devin: replayDevinClient(),
      github: replayGitHubClient(repoRoot),
      repoRoot,
      mode: "replay",
    };
  }
  return {
    devin: httpDevinClient({ apiKey, orgId, baseUrl: process.env.DEVIN_API_BASE }, fetchImpl),
    github: token ? httpGitHubClient(token, fetchImpl, process.env.GITHUB_API_BASE) : null,
    repoRoot,
    mode: "live",
    playbookId: process.env.DEVIN_PLAYBOOK_ID,
  };
}
