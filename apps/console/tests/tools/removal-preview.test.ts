import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { REFUND_CLUSTERING_HOLD } from "@console/tool-automation";
import {
  execFileHistoryReader,
  parseAddedLines,
  parseLog,
  parseNumstat,
  type HistoryReader,
} from "@console/tool-automation/git";
import {
  buildRemovalPreview,
  declaredSettings,
  isTestPath,
  nextStepSentence,
  prNumberFromSubject,
  prNumberFromUrl,
} from "@console/tool-automation/removal-preview";

describe("git history parsers", () => {
  it("parses numstat, counting binary files as 0/0", () => {
    expect(parseNumstat("12\t3\ttools/refunds/src/index.ts\n-\t-\tdocs/a.png\n\n")).toEqual([
      { path: "tools/refunds/src/index.ts", additions: 12, deletions: 3 },
      { path: "docs/a.png", additions: 0, deletions: 0 },
    ]);
  });

  it("parses the log format into sha, time and subject", () => {
    const line = `${"a".repeat(40)}\u001f1700000000\u001fAdd the hold (#12)`;
    expect(parseLog(`${line}\n`)).toEqual([
      { sha: "a".repeat(40), committedAt: 1_700_000_000_000, subject: "Add the hold (#12)" },
    ]);
    expect(parseLog("")).toEqual([]);
  });

  it("keeps only the added lines of a diff", () => {
    const diff = ["+++ b/x.ts", "--- a/x.ts", "+const a = 1;", "-const b = 2;", " ctx", "+"].join("\n");
    expect(parseAddedLines(diff)).toEqual(["const a = 1;", ""]);
  });
});

describe("removal preview helpers", () => {
  it("reads PR numbers from URLs and squash subjects", () => {
    expect(prNumberFromUrl("https://github.com/o/r/pull/42")).toBe(42);
    expect(prNumberFromUrl(null)).toBeNull();
    expect(prNumberFromSubject("Route split refunds (#57)")).toBe(57);
    expect(prNumberFromSubject("Merge branch 'x'")).toBeNull();
  });

  it("recognises test files", () => {
    expect(isTestPath("apps/console/tests/tools/refunds.test.ts")).toBe(true);
    expect(isTestPath("tools/refunds/src/hold.test.ts")).toBe(true);
    expect(isTestPath("tools/refunds/src/hold.ts")).toBe(false);
  });

  it("finds the settings a diff declares", () => {
    expect(
      declaredSettings([
        '      key: "refunds.clustering_window_days",',
        'export const MONITORING_KEY = "kyc.merchant_monitoring";',
        '  const label = "refunds.not_a_setting";',
        'key: CLUSTERING_WINDOW_DAYS_KEY,',
      ]),
    ).toEqual(["refunds.clustering_window_days", "kyc.merchant_monitoring"]);
  });

  it("phrases what happens next by how much is kept", () => {
    expect(nextStepSentence(0)).toBe(
      "Devin opens a pull request that takes this rule out and an engineer reviews it before anything changes here.",
    );
    expect(nextStepSentence(1)).toContain("keeping the one change made since");
    expect(nextStepSentence(3)).toContain("keeping the 3 changes made since");
  });
});

const run = {
  id: "01RUN",
  intent: REFUND_CLUSTERING_HOLD.intents.change,
  requestedByRole: "manager",
  prUrl: "https://github.com/o/r/pull/42",
  mergeCommit: "d".repeat(40),
};

describe("buildRemovalPreview", () => {
  it("assembles the request, the merge's files, tests and settings, and later commits Devin keeps", async () => {
    const calls: string[] = [];
    const history: HistoryReader = {
      async commitMeta(_cwd, commit) {
        calls.push(`meta:${commit.slice(0, 7)}`);
        return { sha: commit, committedAt: 1_700_000_000_000, subject: "Add the hold (#42)" };
      },
      async commitStat() {
        return [
          { path: "tools/refunds/src/clustering-hold.ts", additions: 40, deletions: 0 },
          { path: "apps/console/tests/tools/refunds-clustering-hold.test.ts", additions: 25, deletions: 0 },
          { path: "runs/01RUN/context.json", additions: 9, deletions: 0 },
        ];
      },
      async commitsTouching(_cwd, since, ref, paths) {
        calls.push(`log:${since.slice(0, 7)}..${ref}:${paths.join(",")}`);
        return [{ sha: "e".repeat(40), committedAt: 1_700_000_500_000, subject: "Tighten the hold (#57)" }];
      },
      async addedLines() {
        return ['      key: "refunds.clustering_window_days",'];
      },
    };
    const preview = await buildRemovalPreview(run, REFUND_CLUSTERING_HOLD, { repoRoot: "/repo", history });
    expect(preview).toMatchObject({
      runId: "01RUN",
      request: REFUND_CLUSTERING_HOLD.intents.change,
      askedBy: "Manager",
      prNumber: 42,
      prUrl: run.prUrl,
      mergedAt: 1_700_000_000_000,
      tests: ["apps/console/tests/tools/refunds-clustering-hold.test.ts"],
      settings: ["refunds.clustering_window_days"],
      changedSince: [{ sha: "e".repeat(40), prNumber: 57, subject: "Tighten the hold (#57)" }],
    });
    expect(preview.files).toHaveLength(3);
    expect(preview.nextStep).toContain("keeping the one change made since");
    // The run's own folder is never a reason to list a later commit.
    expect(calls).toEqual([
      "meta:ddddddd",
      "log:ddddddd..HEAD:tools/refunds/src/clustering-hold.ts,apps/console/tests/tools/refunds-clustering-hold.test.ts",
    ]);
  });

  it("names the spec's switch setting even when the diff does not spell it out", async () => {
    const history: HistoryReader = {
      async commitMeta(_cwd, commit) {
        return { sha: commit, committedAt: 1, subject: "x" };
      },
      async commitStat() {
        return [{ path: "tools/refunds/src/index.ts", additions: 1, deletions: 1 }];
      },
      async commitsTouching() {
        return [];
      },
      async addedLines() {
        return ["key: CLUSTERING_WINDOW_DAYS_KEY,"];
      },
    };
    const preview = await buildRemovalPreview(run, REFUND_CLUSTERING_HOLD, { repoRoot: "/repo", history });
    expect(preview.settings).toEqual([REFUND_CLUSTERING_HOLD.switchSetting]);
    expect(preview.changedSince).toEqual([]);
    expect(preview.nextStep).toBe(nextStepSentence(0));
  });

  it("says so when the merge is not in the checkout yet, without reading further", async () => {
    let reads = 0;
    const history: HistoryReader = {
      async commitMeta() {
        return null;
      },
      async commitStat() {
        reads++;
        return [];
      },
      async commitsTouching() {
        reads++;
        return [];
      },
      async addedLines() {
        reads++;
        return [];
      },
    };
    const preview = await buildRemovalPreview(run, REFUND_CLUSTERING_HOLD, { repoRoot: "/repo", history });
    expect(preview).toMatchObject({ mergedAt: null, files: [], tests: [], settings: [], changedSince: [] });
    expect(reads).toBe(0);
    await expect(buildRemovalPreview({ ...run, mergeCommit: null }, undefined, { repoRoot: "/repo", history })).rejects.toThrow(
      /no merge commit/,
    );
  });
});

describe("execFileHistoryReader", () => {
  it("reads a squash merge and what touched its files since from a real checkout, without writing", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "history-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd }).toString().trim();
    const write = (rel: string, text: string) => {
      mkdirSync(dirname(join(cwd, rel)), { recursive: true });
      writeFileSync(join(cwd, rel), text);
    };
    git("init", "-q", "-b", "main");
    write("tools/refunds/src/index.ts", "export const a = 1;\n");
    git("add", "."); git("commit", "-q", "-m", "init");
    write("tools/refunds/src/index.ts", 'export const a = 1;\nexport const KEY = "refunds.clustering_window_days";\n');
    write("apps/console/tests/tools/hold.test.ts", "it()\n");
    git("add", "."); git("commit", "-q", "-m", "Add the hold (#42)");
    const merge = git("rev-parse", "HEAD");
    write("tools/refunds/src/index.ts", 'export const a = 2;\nexport const KEY = "refunds.clustering_window_days";\n');
    git("add", "."); git("commit", "-q", "-m", "Tighten the hold (#57)");
    write("docs/x.md", "unrelated\n");
    git("add", "."); git("commit", "-q", "-m", "Docs (#58)");
    const head = git("rev-parse", "HEAD");

    const history = execFileHistoryReader();
    expect(await history.commitStat(cwd, merge)).toEqual([
      { path: "apps/console/tests/tools/hold.test.ts", additions: 1, deletions: 0 },
      { path: "tools/refunds/src/index.ts", additions: 1, deletions: 0 },
    ]);
    const meta = await history.commitMeta(cwd, merge);
    expect(meta?.subject).toBe("Add the hold (#42)");
    expect(meta?.committedAt).toBeGreaterThan(1_600_000_000_000);
    expect(await history.commitMeta(cwd, "f".repeat(40))).toBeNull();
    expect((await history.addedLines(cwd, merge)).sort()).toEqual(['export const KEY = "refunds.clustering_window_days";', "it()"]);
    const later = await history.commitsTouching(cwd, merge, "HEAD", ["tools/refunds/src/index.ts", "apps/console/tests/tools/hold.test.ts"]);
    expect(later.map((c) => c.subject)).toEqual(["Tighten the hold (#57)"]);
    expect(await history.commitsTouching(cwd, merge, "HEAD", [])).toEqual([]);

    const preview = await buildRemovalPreview({ ...run, mergeCommit: merge }, REFUND_CLUSTERING_HOLD, { repoRoot: cwd, history });
    expect(preview.settings).toEqual(["refunds.clustering_window_days"]);
    expect(preview.tests).toEqual(["apps/console/tests/tools/hold.test.ts"]);
    expect(preview.changedSince.map((c) => c.prNumber)).toEqual([57]);
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(git("status", "--porcelain")).toBe("");
  });
});
