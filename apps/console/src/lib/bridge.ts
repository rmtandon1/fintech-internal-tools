import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { sqlite } from "@console/db-core";
import { httpDevinClient, httpGitHubClient, resolveOrgId } from "@console/tool-automation";
import type { BridgeDeps } from "@console/tool-automation/bridge";
import { execFileGitRunner } from "@console/tool-automation/git";
import { findPlaybookId } from "@console/tool-automation/playbook-registration";
import { loadRepoEnv, repoRoot as defaultRepoRoot } from "@/lib/env";
import { registerToolConstants } from "@/lib/register-tool-constants";

const execFileAsync = promisify(execFile);

const MigrationJournal = z.object({ entries: z.array(z.object({ when: z.number() })) });
const LastMigration = z.object({ created_at: z.number() });

/** `owner/repo` from GITHUB_REPOSITORY, else the checkout's GitHub remote. */
let repository: string | null | undefined;

function githubRepository(repoRoot: string, remote: string): string | undefined {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  if (repository === undefined) {
    try {
      const url = execFileSync("git", ["remote", "get-url", remote], { cwd: repoRoot, encoding: "utf8" });
      repository = parseGitHubRepository(url);
    } catch {
      repository = null;
    }
  }
  return repository ?? undefined;
}

/** `owner/repo` from an https or ssh GitHub remote URL, or null for any other host. */
export function parseGitHubRepository(url: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?\s*$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * The playbook found by title, kept once found. A failed lookup, or finding
 * none, is retried on the next dispatch, so a playbook registered while the
 * server runs is picked up without a restart.
 */
let playbookLookup: Promise<string | null> | null = null;

/**
 * Credentials for the Devin and GitHub APIs are read here, on the server,
 * and nowhere else. `DEVIN_API_KEY` is the only one Devin needs: the org comes
 * from `GET /v3/self` unless `DEVIN_ORG_ID` is set, and the playbook is found
 * by title unless `DEVIN_PLAYBOOK_ID` is set. Without the key the Devin client
 * is null and the console runs in simulation mode (`lib/devin-status.ts`).
 */
export function bridgeDeps(): BridgeDeps {
  loadRepoEnv();
  const apiKey = process.env.DEVIN_API_KEY;
  const token = process.env.GITHUB_TOKEN;
  const repoRoot = defaultRepoRoot();
  const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init);
  const creds = apiKey
    ? { apiKey, orgId: process.env.DEVIN_ORG_ID || undefined, baseUrl: process.env.DEVIN_API_BASE }
    : null;
  return {
    devin: creds ? httpDevinClient(creds, fetchImpl) : null,
    github: token ? httpGitHubClient(token, fetchImpl, process.env.GITHUB_API_BASE) : null,
    repoRoot,
    git: execFileGitRunner(),
    migrate: async (cwd) => {
      await execFileAsync("pnpm", ["db:migrate"], { cwd });
      // Constants the merged run declares must exist without a re-seed;
      // registerConstants skips keys that already exist.
      registerToolConstants();
    },
    migrationsPending: () => migrationsPending(repoRoot),
    repository: githubRepository(repoRoot, process.env.SYNC_REMOTE ?? "origin"),
    syncRemote: process.env.SYNC_REMOTE,
    syncBranch: process.env.SYNC_BRANCH,
    playbookId: process.env.DEVIN_PLAYBOOK_ID || undefined,
    resolvePlaybookId: creds
      ? () => {
          if (!playbookLookup) {
            const pending = resolveOrgId(creds, fetchImpl)
              .then((orgId) => findPlaybookId(creds.apiKey, orgId, fetchImpl, creds.baseUrl))
              .then((id) => {
                if (id === null) playbookLookup = null;
                return id;
              });
            pending.catch(() => {
              playbookLookup = null;
            });
            playbookLookup = pending;
          }
          return playbookLookup;
        }
      : undefined,
  };
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
