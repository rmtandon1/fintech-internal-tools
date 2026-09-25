import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Server-side git access for the merge sync (MERGE_SYNC.md). Every command
 * runs through `execFile` with an argv array — no shell — so paths and refs
 * are never re-parsed. The runner is injected on `BridgeDeps`, letting tests
 * substitute a fake and never touch the real checkout.
 */

export const SYNC_REMOTE = "origin";
export const SYNC_BRANCH = "cognition-dashboard-devin-integration";

export interface GitRunner {
  currentBranch(cwd: string): Promise<string>;
  isClean(cwd: string): Promise<boolean>;
  head(cwd: string): Promise<string>;
  pullFfOnly(cwd: string, remote: string, branch: string): Promise<void>;
  isAncestor(cwd: string, commit: string, ref: string): Promise<boolean>;
  changedPaths(cwd: string, before: string, after: string): Promise<string[]>;
}

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout).trim();
}

export function execFileGitRunner(): GitRunner {
  return {
    currentBranch: (cwd) => git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    isClean: async (cwd) => (await git(cwd, ["status", "--porcelain"])) === "",
    head: (cwd) => git(cwd, ["rev-parse", "HEAD"]),
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
    changedPaths: async (cwd, before, after) =>
      (await git(cwd, ["diff", "--name-only", before, after])).split("\n").filter((p) => p !== ""),
  };
}
