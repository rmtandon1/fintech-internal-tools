import { roleLabel } from "@console/permissions";
import type { CommitMeta, CommitStat, HistoryReader } from "./git";
import type { RunnableSpec } from "./specs";

/**
 * What "Remove this rule" shows before anyone asks Devin: the request as it
 * was made, what its merge touched, and what has changed on those files
 * since. Everything is read from the local checkout; nothing is sent.
 */
export interface RemovalPreview {
  runId: string;
  /** The requester's sentence. */
  request: string;
  /** Who asked, as a role label. */
  askedBy: string;
  prNumber: number | null;
  prUrl: string | null;
  mergeCommit: string;
  /** When the merge commit was made; null when it is not in the checkout yet. */
  mergedAt: number | null;
  files: CommitStat[];
  /** The files under `files` that are tests. */
  tests: string[];
  /** Setting keys the merge declared, e.g. `refunds.clustering_window_days`. */
  settings: string[];
  /** Later commits on the sync branch touching any of `files`; Devin keeps these. */
  changedSince: LaterCommit[];
  /** One sentence on what happens after "Ask Devin to remove it". */
  nextStep: string;
}

export interface LaterCommit extends CommitMeta {
  prNumber: number | null;
}

/** The run fields the preview reads. */
export interface RemovableRun {
  id: string;
  intent: string;
  requestedByRole: string;
  prUrl: string | null;
  mergeCommit: string | null;
}

export function prNumberFromUrl(url: string | null | undefined): number | null {
  const match = url?.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

/** GitHub's squash title ends in `(#N)`. */
export function prNumberFromSubject(subject: string): number | null {
  const match = /\(#(\d+)\)\s*$/.exec(subject);
  return match ? Number(match[1]) : null;
}

export function isTestPath(path: string): boolean {
  return path.startsWith("apps/console/tests/") || /\.test\.tsx?$/.test(path);
}

const SETTING_KEY = /["']([a-z][a-z0-9_]*\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)["']/;

/**
 * Setting keys a diff's added lines declare: a `key: "tool.name"` in a
 * tool's `constants`, or a `..._KEY = "tool.name"` constant next to it.
 */
export function declaredSettings(addedLines: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const line of addedLines) {
    if (!/\bkey:\s*["']/.test(line) && !/_KEY\s*=\s*["']/.test(line)) continue;
    const match = SETTING_KEY.exec(line);
    if (match) keys.add(match[1]);
  }
  return [...keys];
}

export function nextStepSentence(laterCommits: number): string {
  const kept =
    laterCommits === 0
      ? ""
      : laterCommits === 1
        ? ", keeping the one change made since,"
        : `, keeping the ${laterCommits} changes made since,`;
  return `Devin opens a pull request that takes this rule out${kept} and an engineer reviews it before anything changes here.`;
}

export async function buildRemovalPreview(
  run: RemovableRun,
  spec: Pick<RunnableSpec, "switchSetting"> | undefined,
  deps: { repoRoot: string; history: HistoryReader; syncRef?: string },
): Promise<RemovalPreview> {
  if (!run.mergeCommit) throw new Error(`Run ${run.id} has no merge commit`);
  const { repoRoot, history } = deps;
  const ref = deps.syncRef ?? "HEAD";
  const meta = await history.commitMeta(repoRoot, run.mergeCommit);
  const files = meta ? await history.commitStat(repoRoot, run.mergeCommit) : [];
  const paths = files.map((f) => f.path).filter((path) => !path.startsWith("runs/"));
  const [added, later] = meta
    ? await Promise.all([
        history.addedLines(repoRoot, run.mergeCommit),
        history.commitsTouching(repoRoot, run.mergeCommit, ref, paths),
      ])
    : [[], []];
  const settings = declaredSettings(added);
  if (spec?.switchSetting && !settings.includes(spec.switchSetting) && meta) settings.unshift(spec.switchSetting);
  const changedSince = later.map((commit) => ({ ...commit, prNumber: prNumberFromSubject(commit.subject) }));
  return {
    runId: run.id,
    request: run.intent,
    askedBy: roleLabel(run.requestedByRole),
    prNumber: prNumberFromUrl(run.prUrl),
    prUrl: run.prUrl,
    mergeCommit: run.mergeCommit,
    mergedAt: meta?.committedAt ?? null,
    files,
    tests: files.map((f) => f.path).filter(isTestPath),
    settings,
    changedSince,
    nextStep: nextStepSentence(changedSince.length),
  };
}
