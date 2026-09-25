import { resolve } from "node:path";
import {
  findRunByPullNumber,
  getRun,
  httpDevinClient,
  httpGitHubClient,
  replayDevinClient,
  type ReplayLookup,
  replayGitHubClient,
} from "@console/tool-automation";
import type { BridgeDeps } from "@console/tool-automation/bridge";

/**
 * Credentials for the Devin and GitHub APIs are read here, on the server,
 * and nowhere else. Without Devin credentials the console runs in Replay
 * mode: both clients play a recorded fixture and every surface says so. The
 * bridge refuses to serve a live run's session with replay clients and vice
 * versa, so a credential change never lets fixture data stand in for GitHub.
 */
const replayLookup: ReplayLookup = {
  runStatus: (runId) => getRun(runId)?.status ?? null,
  runForPull: (prNumber) => {
    const run = findRunByPullNumber(prNumber);
    return run ? { id: run.id, status: run.status } : null;
  },
};

export function bridgeDeps(): BridgeDeps {
  const apiKey = process.env.DEVIN_API_KEY;
  const orgId = process.env.DEVIN_ORG_ID;
  const token = process.env.GITHUB_TOKEN;
  const repoRoot = process.env.REPO_ROOT ?? resolve(process.cwd(), "../..");
  const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init);
  if (!apiKey || !orgId) {
    return {
      devin: replayDevinClient(replayLookup),
      github: replayGitHubClient(repoRoot, replayLookup),
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
