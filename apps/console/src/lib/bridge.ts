import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { sqlite } from "@console/db-core";
import {
  httpDevinClient,
  httpGitHubClient,
  replayDevinClient,
  replayGitHubClient,
} from "@console/tool-automation";
import type { BridgeDeps } from "@console/tool-automation/bridge";
import { execFileGitRunner } from "@console/tool-automation/git";
import { registerToolConstants } from "@/lib/register-tool-constants";

const execFileAsync = promisify(execFile);

const MigrationJournal = z.object({ entries: z.array(z.object({ when: z.number() })) });
const LastMigration = z.object({ created_at: z.number() });

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
  const repoRoot = process.env.REPO_ROOT ?? resolve(process.cwd(), "../..");
  const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init);
  if (apiKey && orgId) {
    return {
      mode: "live",
      devin: httpDevinClient({ apiKey, orgId, baseUrl: process.env.DEVIN_API_BASE }, fetchImpl),
      github: token ? httpGitHubClient(token, fetchImpl, process.env.GITHUB_API_BASE) : null,
      repoRoot,
      replaysDir: resolve(repoRoot, "apps/console/data/replays"),
      git: execFileGitRunner(),
      migrate: async (cwd) => {
        await execFileAsync("pnpm", ["db:migrate"], { cwd });
        // Constants the merged run declares must exist without a re-seed;
        // registerConstants skips keys that already exist.
        registerToolConstants();
      },
      migrationsPending: () => migrationsPending(repoRoot),
      syncRemote: process.env.SYNC_REMOTE,
      syncBranch: process.env.SYNC_BRANCH,
      playbookId: process.env.DEVIN_PLAYBOOK_ID,
    };
  }
  // Replay has no git sync: the scripted merge commit never lands on a real
  // checkout, so there is nothing to pull.
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

/**
 * The same check drizzle's better-sqlite3 migrator makes: a journal entry is
 * pending when its `when` postdates the last row in `__drizzle_migrations`.
 * A missing table or row means everything is pending.
 */
async function migrationsPending(repoRoot: string): Promise<boolean> {
  const journal = MigrationJournal.parse(
    JSON.parse(readFileSync(join(repoRoot, "apps/console/drizzle/meta/_journal.json"), "utf8")),
  );
  let last: number | null = null;
  try {
    const row = sqlite
      .prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
      .get();
    const parsed = LastMigration.safeParse(row);
    last = parsed.success ? parsed.data.created_at : null;
  } catch {
    return true;
  }
  return last === null || journal.entries.some((entry) => entry.when > last);
}
