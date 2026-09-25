import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { listAuditEvents } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor } from "@console/engine/types";
import {
  automationTool,
  type DevinClient,
  getRun,
  IN_FLIGHT_STATUSES,
  REFUND_CLUSTERING_HOLD,
  replayDevinClient,
  replayGitHubClient,
  scriptedFrames,
  type SessionSnapshot,
} from "@console/tool-automation";
import { approveRun, dispatchRun } from "@console/tool-automation/bridge";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { handleGet, handlePost, type RunViewPayload } from "@/lib/devin-route";
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
    expect(earlyBody.summary).toBe(
      REFUND_CLUSTERING_HOLD.summaries["IMPLEMENTATION/ADDITION"],
    );
    expect(earlyBody.lastAuditId).toBe(
      listAuditEvents({ recordId: out.runId, limit: 1 }).rows[0]?.id,
    );
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
    // The latest audit row is the record_merge intent just applied.
    expect(merged.lastAuditId).toBe(
      listAuditEvents({ recordId: out.runId, limit: 1 }).rows[0]?.id,
    );
  });

  /** A Devin client scripted to one snapshot; records sendMessage calls. */
  function scriptedDevin(snapshot: SessionSnapshot) {
    const sent: string[] = [];
    const client: DevinClient = {
      async createSession() {
        return { sessionId: "s-scripted", url: null };
      },
      async getSession() {
        return snapshot;
      },
      async sendMessage(_id, message) {
        sent.push(message);
      },
      async terminateSession() {},
    };
    return { client, sent };
  }

  it("lands the governed stop when the session has ended, exactly once", async () => {
    stopAll();
    const devin = scriptedDevin({
      status: "stopped",
      statusDetail: "session finished",
      structuredOutput: null,
    });
    const d = { ...deps(), devin: devin.client };
    const out = await dispatchRun(admin, request, d);

    const first = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(first.run.status).toBe("stopped");
    expect(listAuditEvents({ recordId: out.runId, action: "stop" }).rows).toHaveLength(1);

    const again = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(again.run.status).toBe("stopped");
    expect(listAuditEvents({ recordId: out.runId, action: "stop" }).rows).toHaveLength(1);
  });

  it("does not stop a run whose session is merely blocked", async () => {
    stopAll();
    const devin = scriptedDevin({
      status: "blocked",
      statusDetail: "blocked_on_approval",
      structuredOutput: null,
    });
    const d = { ...deps(), devin: devin.client };
    const out = await dispatchRun(admin, request, d);
    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.run.status).toBe("running");
    expect(listAuditEvents({ recordId: out.runId, action: "stop" }).rows).toHaveLength(0);
  });
});

describe("POST /api/devin/<runId>", () => {
  /** Write `frames` as the run's recording, as a poll would have left it. */
  function record(runId: string, phaseStatus: string) {
    const frame = JSON.parse(
      JSON.stringify(
        scriptedFrames("IMPLEMENTATION/ADDITION", runId, "0".repeat(64), "0".repeat(40))[0],
      ),
    ) as { structured_output: { phase_status: string } };
    frame.structured_output.phase_status = phaseStatus;
    mkdirSync(replaysDir, { recursive: true });
    writeFileSync(join(replaysDir, `${runId}.json`), JSON.stringify([frame]));
  }

  it("replies only while the session waits for input, then calls sendMessage", async () => {
    stopAll();
    const sent: string[] = [];
    const devin: DevinClient = {
      async createSession() {
        return { sessionId: "s-post", url: null };
      },
      async getSession() {
        return { status: "working", statusDetail: "waiting_for_user", structuredOutput: null };
      },
      async sendMessage(_id, message) {
        sent.push(message);
      },
      async terminateSession() {},
    };
    const d = { ...deps(), devin };
    const out = await dispatchRun(admin, request, d);

    record(out.runId, "running");
    const running = await handlePost(out.runId, admin, d, { message: "carry on" });
    expect(running.status).toBe(409);
    expect(sent).toHaveLength(0);

    record(out.runId, "waiting_for_user");
    const waiting = await handlePost(out.runId, admin, d, { message: "use the second option" });
    expect(waiting.status).toBe(200);
    expect(sent).toEqual(["use the second option"]);
  });
});
