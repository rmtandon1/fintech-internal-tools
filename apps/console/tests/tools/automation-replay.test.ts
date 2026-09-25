import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor } from "@console/engine/types";
import {
  automationTool,
  CI_CHECKS,
  getRun,
  IN_FLIGHT_STATUSES,
  parsePullUrl,
  REFUND_CLUSTERING_HOLD,
  replayDevinClient,
  replayGitHubClient,
  ReplayFile,
  scriptedFrames,
} from "@console/tool-automation";
import {
  approveRun,
  type BridgeDeps,
  dispatchRun,
  observeMerge,
  pollRun,
} from "@console/tool-automation/bridge";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { admin, setupHarness } from "../helpers/harness";

const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];
const SHA = "f".repeat(64);
const BASE = "e".repeat(40);

let repoRoot: string;
let replaysDir: string;

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  repoRoot = mkdtempSync(join(tmpdir(), "replay-repo-"));
  replaysDir = mkdtempSync(join(tmpdir(), "replays-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repoRoot });
  git("init", "-q", "-b", "devin/test");
  git("commit", "-q", "--allow-empty", "-m", "init");
});

const request = {
  spec: REFUND_CLUSTERING_HOLD.file,
  kind: "IMPLEMENTATION/ADDITION" as const,
  scope: "rule" as const,
  intent: REFUND_CLUSTERING_HOLD.intents["IMPLEMENTATION/ADDITION"] ?? "",
  clusterKey: "Kestrel Outdoors",
  evidenceIds: KESTREL,
};

function stopAll() {
  const { rows } = automationTool.list({ filters: {}, limit: 100, offset: 0 });
  for (const row of rows) {
    if (!IN_FLIGHT_STATUSES.some((s) => s === row.status)) continue;
    executeIntent(admin, {
      tool: "automation",
      action: "stop",
      recordId: row.id,
      input: { reason: "cleanup" },
      idempotencyKey: ulid(),
    });
  }
}

describe("scriptedFrames", () => {
  it("produces frames valid against ReplayFile for both kinds", () => {
    for (const kind of ["IMPLEMENTATION/ADDITION", "REVERSAL"] as const) {
      const frames = scriptedFrames(kind, "run_1", SHA, BASE);
      expect(ReplayFile.parse(frames)).toEqual(frames);
      expect(frames.at(-1)?.structured_output.pr_url).toMatch(/pull\/99\d$/);
      expect(frames.at(-1)?.structured_output.phase_status).toBe("done");
    }
  });

  it("names exactly the four CI checks in verify_steps", () => {
    const last = scriptedFrames("IMPLEMENTATION/ADDITION", "run_1", SHA, BASE).at(-1);
    expect(last?.structured_output.verify_steps.map((s) => s.name)).toEqual([...CI_CHECKS]);
    const test = last?.structured_output.verify_steps.find((s) => s.name === "Test");
    expect(test).toMatchObject({ pass: true, before: 68, after: 76 });
  });
});

describe("replay clients", () => {
  it("advances the session with the fake clock and ends blocked on approval", async () => {
    stopAll();
    let t = Date.now();
    const devin = replayDevinClient(() => t);
    const deps: BridgeDeps = {
      devin,
      github: replayGitHubClient(() => t),
      repoRoot,
      replaysDir,
      now: () => t,
    };
    const out = await dispatchRun(admin, request, deps);
    const run = getRun(out.runId);
    expect(run?.status).toBe("running");
    expect(run?.sessionId).toMatch(/^replay-/);

    const first = await devin.getSession(run?.sessionId ?? "");
    expect((first.structuredOutput as { phase: string }).phase).toBe("intake");

    t += 45_000;
    const last = await devin.getSession(run?.sessionId ?? "");
    expect(last.status).toBe("blocked");
    expect((last.structuredOutput as { pr_url: string }).pr_url).toMatch(/pull\/990/);
  });

  it("reports the PR merged four seconds after approval", async () => {
    stopAll();
    // The session timeline runs on the fake clock; the merge delay compares
    // against the run's wall-clock updatedAt, so GitHub gets its own offset.
    let t = Date.now();
    let githubShift = 0;
    const devin = replayDevinClient(() => t);
    const github = replayGitHubClient(() => Date.now() + githubShift);
    const deps: BridgeDeps = { devin, github, repoRoot, replaysDir, now: () => t };

    const out = await dispatchRun(admin, request, deps);
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    t += 45_000;
    await pollRun(run, deps);

    const approved = await approveRun(engineer, run, undefined, deps);
    expect(approved.approve.outcome.status).toBe("applied");

    const pr = parsePullUrl("https://github.com/rmtandon1/buy-v-build-cog-demo/pull/990");
    if (!pr) throw new Error("parse failed");
    expect((await github.getPull(pr)).merged).toBe(false);
    githubShift = 4_001;
    const pull = await github.getPull(pr);
    expect(pull.merged).toBe(true);
    expect(pull.mergeCommit).toMatch(/^[0-9a-f]{40}$/);
    expect((await github.getChecks(pr, pull.headSha)).green).toBe(true);
  });

  it("matches the in-flight run over a merged run of the same kind", async () => {
    stopAll();
    let t = Date.now();
    let githubShift = 0;
    const devin = replayDevinClient(() => t);
    const github = replayGitHubClient(() => Date.now() + githubShift);
    const deps: BridgeDeps = { devin, github, repoRoot, replaysDir, now: () => t };

    // Merge one run so its pr_url points at the scripted PR number forever.
    const first = await dispatchRun(admin, request, deps);
    const firstRun = getRun(first.runId);
    if (!firstRun) throw new Error("no run");
    t += 45_000;
    await pollRun(firstRun, deps);
    await approveRun(engineer, firstRun, undefined, deps);
    const pr = parsePullUrl("https://github.com/rmtandon1/buy-v-build-cog-demo/pull/990");
    if (!pr) throw new Error("parse failed");
    githubShift = 4_001;
    expect((await github.getPull(pr)).merged).toBe(true);
    await observeMerge(engineer, getRun(first.runId) ?? firstRun, deps);
    expect(getRun(first.runId)?.status).toBe("merged");
    githubShift = 0;

    // A second dispatch in flight must be what getPull reports on, even
    // though the merged run's pr_url also matches.
    const second = await dispatchRun(admin, request, deps);
    const secondRun = getRun(second.runId);
    if (!secondRun) throw new Error("no second run");
    const pull = await github.getPull(pr);
    expect(pull.merged).toBe(false);
    expect(pull.headRef).toContain(second.runId);
    expect(await github.fileSha256(pr, pull.headSha, "x")).toBe(secondRun.contextSha256);
  });
});
