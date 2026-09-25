import type { GitRunner } from "@console/tool-automation/git";

/**
 * A `GitRunner` that answers from a script and records its calls, so bridge
 * tests never touch the real checkout. `pullFfOnly` advances the scripted
 * head from `before` to `after` (or leaves it when `after` is omitted).
 */
export function fakeGit(state: {
  branch?: string;
  clean?: boolean;
  before?: string;
  after?: string;
  /** Commits `isAncestor` reports as already on HEAD. */
  ancestors?: readonly string[];
  /** Paths `changedPaths` reports between before and after. */
  changed?: readonly string[];
}) {
  const calls: string[] = [];
  let head = state.before ?? "a".repeat(40);
  const git: GitRunner = {
    async currentBranch() {
      calls.push("branch");
      return state.branch ?? "cognition-dashboard-devin-integration";
    },
    async isClean() {
      calls.push("clean");
      return state.clean ?? true;
    },
    async head() {
      calls.push("head");
      return head;
    },
    async pullFfOnly(_cwd, remote, branch) {
      calls.push(`pull:${remote}/${branch}`);
      head = state.after ?? head;
    },
    async isAncestor(_cwd, commit, ref) {
      calls.push(`ancestor:${commit.slice(0, 7)}@${ref}`);
      return (state.ancestors ?? []).includes(commit);
    },
    async changedPaths(_cwd, before, after) {
      calls.push(`changed:${before.slice(0, 7)}..${after.slice(0, 7)}`);
      return [...(state.changed ?? [])];
    },
  };
  return { git, calls };
}
