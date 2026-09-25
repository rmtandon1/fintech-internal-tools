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
  getRun,
  IN_FLIGHT_STATUSES,
  REFUND_CLUSTERING_HOLD,
  replayDevinClient,
  replayGitHubClient,
} from "@console/tool-automation";
import { approveRun, dispatchRun } from "@console/tool-automation/bridge";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { handleGet, type RunViewPayload } from "@/lib/devin-route";
import type { AppBridgeDeps } from "@/lib/bridge";
import { admin, refundsAgent, setupHarness } from "../helpers/harness";

const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];

let repoRoot: string;
let replaysDir: string;

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  repoRoot = mkdtempSync(join(tmpdir(), "route-repo-"));
  replaysDir = mkdtempSync(join(tmpdir(), "route-replays-"));
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

let t = Date.now();
// The session timeline runs on `t`; the merge delay compares against the
// run's wall-clock updatedAt, so the GitHub client shifts real time instead.
let githubShift = 0;
function deps(): AppBridgeDeps {
  return {
    mode: "replay",
    devin: replayDevinClient(() => t),
    github: replayGitHubClient(() => Date.now() + githubShift),
    repoRoot,
    replaysDir,
    now: () => t,
  };
}

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

describe("GET /api/devin/<runId>", () => {
  it("rejects a role outside AUTOMATION_ROLES", async () => {
    const result = await handleGet("whatever", refundsAgent, deps());
    expect(result.status).toBe(403);
  });

  it("404s an unknown run", async () => {
    const result = await handleGet("01KZZZZZZZZZZZZZZZZZZZZZZZ", admin, deps());
    expect(result.status).toBe(404);
  });

  it("labels replay mode and advances frames with the clock", async () => {
    stopAll();
    const d = deps();
    const out = await dispatchRun(admin, request, d);

    const early = await handleGet(out.runId, admin, d);
    expect(early.status).toBe(200);
    const earlyBody = early.body as RunViewPayload;
    expect(earlyBody.mode).toBe("replay");
    expect(earlyBody.sessionUrl).toBeNull();
    expect(earlyBody.latest?.structured_output.phase).toBe("intake");

    t += 45_000;
    const late = await handleGet(out.runId, admin, d);
    const lateBody = late.body as RunViewPayload;
    expect(lateBody.frames.length).toBeGreaterThan(earlyBody.frames.length);
    expect(lateBody.latest?.structured_output.phase).toBe("pull_request");
    expect(lateBody.latest?.structured_output.pr_url).toMatch(/pull\/990/);
    expect(lateBody.offers.approve.offered).toBe(false); // admin requested, engineer approves
    expect(lateBody.offers.stop.offered).toBe(true);
  });

  it("observes the merge once the approved run is four seconds old", async () => {
    stopAll();
    const d = deps();
    const out = await dispatchRun(admin, request, d);
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    t += 45_000;
    await handleGet(out.runId, admin, d); // record the pr_open frame
    const approved = await approveRun(engineer, run, undefined, d);
    expect(approved.approve.outcome.status).toBe("applied");

    const tooEarly = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(tooEarly.run.status).toBe("approved");

    githubShift = 4_001;
    const merged = (await handleGet(out.runId, engineer, d)).body as RunViewPayload;
    expect(merged.run.status).toBe("merged");
    expect(merged.run.mergeCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(merged.latest?.structured_output.merge_commit).toBe(merged.run.mergeCommit);
  });
});
