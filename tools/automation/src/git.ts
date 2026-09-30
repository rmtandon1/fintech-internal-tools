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

/** One file of a commit's diff against its first parent. Binary files count 0/0. */
export interface CommitStat {
  path: string;
  additions: number;
  deletions: number;
}

export interface CommitMeta {
  sha: string;
  subject: string;
  /** Committer time, epoch ms. */
  committedAt: number;
}

/**
 * Read-only history for the removal preview: what a merge changed, when, and
 * what has touched the same files since. Nothing here writes or fetches.
 */
export interface HistoryReader {
  commitStat(cwd: string, commit: string): Promise<CommitStat[]>;
  /** Null when the commit is not in the local checkout. */
  commitMeta(cwd: string, commit: string): Promise<CommitMeta | null>;
  /** Commits after `since` up to `ref` that touch any of `paths`, newest first. */
  commitsTouching(cwd: string, since: string, ref: string, paths: readonly string[]): Promise<CommitMeta[]>;
  /** The lines a commit added, without the leading `+`. */
  addedLines(cwd: string, commit: string): Promise<string[]>;
}

export interface GitRunner {
  currentBranch(cwd: string): Promise<string>;
  status(cwd: string): Promise<StatusEntry[]>;
  head(cwd: string): Promise<string>;
  pullFfOnly(cwd: string, remote: string, branch: string): Promise<void>;
  isAncestor(cwd: string, commit: string, ref: string): Promise<boolean>;
  /** Paths that differ between two commits (`git diff --name-only`). */
  changedPaths(cwd: string, from: string, to: string): Promise<string[]>;
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

/** Parses `git diff --numstat`: `<added>\t<deleted>\t<path>`, `-` for binary. */
export function parseNumstat(stdout: string): CommitStat[] {
  return stdout
    .split("\n")
    .filter((line) => line.includes("\t"))
    .map((line) => {
      const [added, deleted, ...rest] = line.split("\t");
      return {
        path: rest.join("\t"),
        additions: added === "-" ? 0 : Number(added),
        deletions: deleted === "-" ? 0 : Number(deleted),
      };
    });
}

/** Record separator between the fields `LOG_FORMAT` prints. */
const RS = "\u001f";
const LOG_FORMAT = `%H${RS}%ct${RS}%s`;

/** Parses lines of `LOG_FORMAT`. */
export function parseLog(stdout: string): CommitMeta[] {
  return stdout
    .split("\n")
    .filter((line) => line.includes(RS))
    .map((line) => {
      const [sha, seconds, ...subject] = line.split(RS);
      return { sha, committedAt: Number(seconds) * 1000, subject: subject.join(RS) };
    });
}

/** The `+` lines of a unified diff, minus the file headers. */
export function parseAddedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

export function execFileHistoryReader(): HistoryReader {
  // `-m --first-parent` diffs a merge commit against the branch it merged
  // into, so a true merge and a squash read the same way.
  const show = (commit: string, ...args: string[]) => [
    "show",
    "--format=",
    "--first-parent",
    "-m",
    ...args,
    commit,
    "--",
  ];
  return {
    commitStat: async (cwd, commit) => parseNumstat(await git(cwd, show(commit, "--numstat"))),
    commitMeta: async (cwd, commit) => {
      try {
        return parseLog(await git(cwd, ["show", "-s", `--format=${LOG_FORMAT}`, commit, "--"]))[0] ?? null;
      } catch {
        return null;
      }
    },
    commitsTouching: async (cwd, since, ref, paths) =>
      paths.length === 0
        ? []
        : parseLog(await git(cwd, ["log", `--format=${LOG_FORMAT}`, `${since}..${ref}`, "--", ...paths])),
    addedLines: async (cwd, commit) => parseAddedLines(await git(cwd, show(commit, "--unified=0"))),
  };
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
    changedPaths: async (cwd, from, to) =>
      (await git(cwd, ["diff", "--name-only", from, to])).split("\n").filter((line) => line.length > 0),
    removePath: async (cwd, relPath) => {
      await rm(join(cwd, relPath), { force: true });
    },
  };
}
