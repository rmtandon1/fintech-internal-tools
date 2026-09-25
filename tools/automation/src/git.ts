import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Server-side git access for the merge sync (MERGE_SYNC.md). Every command
 * runs through `execFile` with an argv array — no shell — so paths and refs
 * are never re-parsed. The runner is injected on `BridgeDeps`, letting tests
 * substitute a fake and never touch the real checkout.
 */

export const SYNC_REMOTE = "origin";
export const SYNC_BRANCH = "cognition-dashboard-devin-integration";

export interface StatusEntry {
  path: string;
  untracked: boolean;
}

export interface GitRunner {
  currentBranch(cwd: string): Promise<string>;
  status(cwd: string): Promise<StatusEntry[]>;
  head(cwd: string): Promise<string>;
  pullFfOnly(cwd: string, remote: string, branch: string): Promise<void>;
  isAncestor(cwd: string, commit: string, ref: string): Promise<boolean>;
  /** Deletes a working-tree file directly; not a git operation. */
  removePath(cwd: string, relPath: string): Promise<void>;
}

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout);
}

/** Parses `git status --porcelain --untracked-files=all`: `XY <path>` or `XY <old> -> <new>`. */
function parseStatus(stdout: string): StatusEntry[] {
  return stdout
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => {
      const untracked = line.startsWith("??");
      let path = line.slice(3);
      const rename = path.indexOf(" -> ");
      if (rename >= 0) path = path.slice(rename + 4);
      return { path, untracked };
    });
}

export function execFileGitRunner(): GitRunner {
  return {
    currentBranch: async (cwd) => (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim(),
    status: async (cwd) => parseStatus(await git(cwd, ["status", "--porcelain", "--untracked-files=all"])),
    head: async (cwd) => (await git(cwd, ["rev-parse", "HEAD"])).trim(),
    pullFfOnly: async (cwd, remote, branch) => {
      await git(cwd, ["pull", "--ff-only", remote, branch]);
    },
    isAncestor: async (cwd, commit, ref) => {
      try {
        await execFileAsync("git", ["merge-base", "--is-ancestor", commit, ref], { cwd });
        return true;
      } catch {
        return false;
      }
    },
    removePath: async (cwd, relPath) => {
      await rm(join(cwd, relPath), { force: true });
    },
  };
}
