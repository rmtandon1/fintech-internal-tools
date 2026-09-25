import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { httpDevinClient, httpGitHubClient } from "@console/tool-automation";
import type { BridgeDeps } from "@console/tool-automation/bridge";
import { execFileGitRunner } from "@console/tool-automation/git";

const execFileAsync = promisify(execFile);

/**
 * Credentials for the Devin and GitHub APIs are read here, on the server,
 * and nowhere else. A missing variable leaves that client null: dispatch then
 * records a `dispatch_failed` run instead of throwing, and approval reports
 * that GitHub is unconfigured.
 */
export function bridgeDeps(): BridgeDeps {
  const apiKey = process.env.DEVIN_API_KEY;
  const orgId = process.env.DEVIN_ORG_ID;
  const token = process.env.GITHUB_TOKEN;
  const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init);
  return {
    devin:
      apiKey && orgId
        ? httpDevinClient({ apiKey, orgId, baseUrl: process.env.DEVIN_API_BASE }, fetchImpl)
        : null,
    github: token ? httpGitHubClient(token, fetchImpl, process.env.GITHUB_API_BASE) : null,
    repoRoot: process.env.REPO_ROOT ?? resolve(process.cwd(), "../.."),
    git: execFileGitRunner(),
    migrate: async (cwd) => {
      await execFileAsync("pnpm", ["db:migrate"], { cwd });
    },
    syncRemote: process.env.SYNC_REMOTE,
    syncBranch: process.env.SYNC_BRANCH,
    playbookId: process.env.DEVIN_PLAYBOOK_ID,
  };
}
