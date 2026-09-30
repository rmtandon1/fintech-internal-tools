import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ulid } from "ulid";
import { listAuditEvents } from "@console/engine/audit/query";
import { db } from "@console/db";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor } from "@console/engine/types";
import {
  automationTool,
  type DevinClient,
  getRun,
  type GitHubClient,
  IN_FLIGHT_STATUSES,
  COMPANIES_HOUSE_CHECK,
  REFUND_CLUSTERING_HOLD,
  type SessionSnapshot,
} from "@console/tool-automation";
import { replayDevinClient, replayGitHubClient, scriptedFrames } from "../helpers/scripted-clients";
import { approveRun, dispatchRun, prClosedReason } from "@console/tool-automation/bridge";
import { devinRuns } from "@console/tool-automation/schema";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { handleGet, handlePost, type RunViewPayload } from "@/lib/devin-route";
import type { AppBridgeDeps } from "@/lib/bridge";
import { admin, analyst, setupHarness } from "../helpers/harness";

const engineer: Actor = { id: "usr_engineer", name: "Engineer", role: "engineer" };
const CASE = ["kyc_0003"];
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];

let repoRoot: string;
let replaysDir: string;

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
  repoRoot = mkdtempSync(join(tmpdir(), "route-repo-"));
  replaysDir = mkdtempSync(join(tmpdir(), "route-replays-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repoRoot });
  git("init", "-q", "-b", "devin/test");
  git("commit", "-q", "--allow-empty", "-m", "init");
});

const request = {
  spec: COMPANIES_HOUSE_CHECK.file,
  operation: "change" as const,
  intent: COMPANIES_HOUSE_CHECK.intents.change,
  evidenceKey: "kyc_0003",
  evidenceIds: CASE,
};

let t = Date.now();
// The session timeline runs on `t`; the merge delay compares against the
// run's wall-clock updatedAt, so the GitHub client shifts real time instead.
let githubShift = 0;
function deps(): AppBridgeDeps {
  return {
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
    const result = await handleGet("whatever", analyst, deps());
    expect(result.status).toBe(403);
  });

  it("404s an unknown run", async () => {
    const result = await handleGet("01KZZZZZZZZZZZZZZZZZZZZZZZ", admin, deps());
    expect(result.status).toBe(404);
  });

  it("reports simulation mode and advances frames with the clock", async () => {
    stopAll();
    const d = deps();
    const out = await dispatchRun(admin, request, d);

    const early = await handleGet(out.runId, admin, d);
    expect(early.status).toBe(200);
    const earlyBody = early.body as RunViewPayload;
    expect(earlyBody.mode).toBe("simulation");
    expect(earlyBody.sessionUrl).toBeNull();
    expect(earlyBody.summary).toBe(
      COMPANIES_HOUSE_CHECK.summaries.change,
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

  it("hands the reviewer checklist to the run view, not the session", async () => {
    stopAll();
    const d = deps();
    const out = await dispatchRun(admin, request, d);
    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.reviewerChecklist).toHaveLength(10);
    expect(body.reviewerChecklist[0]).toMatch(/^Only approved UK business cases are rechecked/);
  });

  it("shows the run view the prompt the session was sent", async () => {
    stopAll();
    const d = deps();
    const out = await dispatchRun(admin, request, d);
    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.prompt).toBe(out.prompt);
    expect(body.prompt).toContain(request.intent);
  });

  it("observes the merge once the approved run is four seconds old", async () => {
    stopAll();
    const d = deps();
    const out = await dispatchRun(admin, request, d);
    const run = getRun(out.runId);
    if (!run) throw new Error("no run");
    t += 45_000;
    await handleGet(out.runId, admin, d); // record the pr_open frame and the pr
    const polled = getRun(out.runId);
    if (!polled) throw new Error("no run");
    const approved = await approveRun(engineer, polled, undefined, d);
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

  it("merges an approved run whose PR merged even though the session ended", async () => {
    stopAll();
    // The poll reports the session over; the same snapshot carries the PR,
    // and GitHub says the PR is already merged. The merge must win over the
    // session-end stop.
    let contextSha: string | null = null;
    const devin = scriptedDevin({
      status: "stopped",
      statusDetail: "session finished",
      structuredOutput: scriptedFrames(
        "change",
        "run",
        "0".repeat(64),
        "0".repeat(40),
      ).at(-1)!.structured_output,
    });
    const github = {
      async getPull() {
        return {
          headSha: "c".repeat(40),
          headRef: "devin/run",
          state: "closed" as const,
          merged: true,
          mergeCommit: "d".repeat(40),
          mergedBy: null,
        };
      },
      async getChecks() {
        return { green: true, summary: "all checks green" };
      },
      async fileSha256() {
        return contextSha;
      },
      async approvePull() {},
      async hasApprovingReview() {
        return true;
      },
      async listApprovingReviews() {
        return [];
      },
    };
    const d = { ...deps(), devin: devin.client, github };
    const out = await dispatchRun(admin, request, d);
    contextSha = getRun(out.runId)?.contextSha256 ?? null;

    await approveRun(engineer, getRun(out.runId)!, undefined, d);
    expect(getRun(out.runId)?.status).toBe("approved");

    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.run.status).toBe("merged");
    expect(body.run.mergeCommit).toBe("d".repeat(40));
    expect(listAuditEvents({ recordId: out.runId, action: "record_merge" }).rows).toHaveLength(1);
    expect(listAuditEvents({ recordId: out.runId, action: "stop" }).rows).toHaveLength(0);
  });

  /** A GitHub whose PR carries `reviews` at the head and is merged when `merged`, closed unmerged when `closed`. */
  function githubWith(state: {
    reviews?: { login: string; body?: string }[];
    merged?: boolean;
    mergedBy?: string | null;
    closed?: boolean;
    green?: boolean;
    contextSha: () => string | null;
  }) {
    const client: GitHubClient = {
      async getPull() {
        return {
          headSha: "c".repeat(40),
          headRef: "devin/run",
          state: state.merged || state.closed ? "closed" : "open",
          merged: state.merged ?? false,
          mergeCommit: state.merged ? "d".repeat(40) : null,
          mergedBy: state.merged ? (state.mergedBy ?? null) : null,
        };
      },
      async getChecks() {
        return { green: state.green ?? true, summary: state.green === false ? "failed: verify" : "all checks green" };
      },
      async fileSha256() {
        return state.contextSha();
      },
      async approvePull() {
        throw new Error("the sync must not post a review");
      },
      async hasApprovingReview() {
        return (state.reviews ?? []).length > 0;
      },
      async listApprovingReviews() {
        return (state.reviews ?? []).map((r) => ({ login: r.login, submittedAt: "2026-01-02T00:00:00Z", body: r.body ?? "" }));
      },
    };
    return client;
  }

  const prReported = () =>
    scriptedDevin({
      status: "working",
      statusDetail: "working",
      structuredOutput: scriptedFrames("change", "run", "0".repeat(64), "0".repeat(40)).at(-1)!.structured_output,
    });

  it("records the mapped engineer's GitHub approval on the poll and tells Devin to merge, once", async () => {
    stopAll();
    const devin = prReported();
    let contextSha: string | null = null;
    const github = githubWith({ reviews: [{ login: "rmtandon1", body: "LGTM" }], contextSha: () => contextSha });
    const d = { ...deps(), devin: devin.client, github };
    const out = await dispatchRun(admin, request, d);
    contextSha = getRun(out.runId)?.contextSha256 ?? null;

    const first = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(first.run.status).toBe("approved");
    expect(first.run.approvedBy).toBe(engineer.id);
    expect(first.run.lastNote).toBe("Approved on GitHub by @rmtandon1");
    expect(first.run.prUrl).toMatch(/pull\/990$/);
    expect(first.githubSyncedAt).toBe(t);
    expect(first.githubNotice).toBeNull();
    expect(devin.sent).toEqual([`Run ${out.runId} is approved. Merge ${first.run.prUrl} now.`]);

    const again = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(again.run.status).toBe("approved");
    expect(devin.sent).toHaveLength(1);
    expect(listAuditEvents({ recordId: out.runId, action: "approve_pr" }).rows).toHaveLength(1);
  });

  it("shows an approval by a login no engineer claims without recording it", async () => {
    stopAll();
    const devin = prReported();
    const github = githubWith({ reviews: [{ login: "drive-by" }], contextSha: () => null });
    const d = { ...deps(), devin: devin.client, github };
    const out = await dispatchRun(admin, request, d);

    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.run.status).toBe("running");
    expect(body.githubSyncedAt).toBe(t);
    expect(body.githubNotice).toBe("Approved on GitHub by @drive-by (not a console engineer)");
    expect(devin.sent).toEqual([]);
    expect(listAuditEvents({ recordId: out.runId, action: "approve_pr" }).rows).toHaveLength(0);
  });

  it("records the mapped engineer's merge as their approval, and links the changed tool", async () => {
    stopAll();
    const devin = prReported();
    let contextSha: string | null = null;
    const github = githubWith({ merged: true, mergedBy: "rmtandon1", contextSha: () => contextSha });
    const d = { ...deps(), devin: devin.client, github };
    const out = await dispatchRun(
      admin,
      {
        spec: REFUND_CLUSTERING_HOLD.file,
        operation: "change",
        intent: REFUND_CLUSTERING_HOLD.intents.change,
        evidenceKey: "Kestrel Outdoors",
        evidenceIds: KESTREL,
      },
      d,
    );
    contextSha = getRun(out.runId)?.contextSha256 ?? null;

    const merged = (await handleGet(out.runId, engineer, d)).body as RunViewPayload;
    expect(merged.run.status).toBe("merged");
    expect(merged.run.approvedBy).toBe(engineer.id);
    expect(merged.run.lastNote).toBe("Approved on GitHub by @rmtandon1, who merged without a review");
    // The engineer can't open the refunds queue, so the poll's payload links nothing.
    expect(merged.changeLink).toBeNull();
    expect(devin.sent).toEqual([]);

    const adminView = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(adminView.changeLink).toEqual({ href: "/t/refunds", label: "Refunds", live: true });
    const approvals = listAuditEvents({ recordId: out.runId, action: "approve_pr" }).rows;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.actorId).toBe(engineer.id);
    expect(listAuditEvents({ recordId: out.runId, action: "record_merge" }).rows).toHaveLength(1);
  });

  it("records a merge GitHub reports before any approval, and says so on the run", async () => {
    stopAll();
    const devin = prReported();
    const github = githubWith({ merged: true, contextSha: () => null });
    const d = { ...deps(), devin: devin.client, github };
    const out = await dispatchRun(admin, request, d);

    const merged = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(merged.run.status).toBe("merged");
    expect(merged.run.mergeCommit).toBe("d".repeat(40));
    expect(merged.run.approvedBy).toBeNull();
    expect(merged.run.lastNote).toBe("Merged on GitHub without a recorded approval");
    expect(merged.githubSyncedAt).toBe(t);
    expect(listAuditEvents({ recordId: out.runId, action: "record_merge" }).rows).toHaveLength(1);
    expect(listAuditEvents({ recordId: out.runId, action: "approve_pr" }).rows).toHaveLength(0);
  });

  it("stops a running run whose PR was closed on GitHub without a merge, once", async () => {
    stopAll();
    const devin = prReported();
    const github = githubWith({ closed: true, contextSha: () => null });
    const d = { ...deps(), devin: devin.client, github };
    const out = await dispatchRun(admin, request, d);

    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.run.status).toBe("stopped");
    expect(body.run.prUrl).toMatch(/pull\/990$/);
    expect(body.run.mergeCommit).toBeNull();
    expect(body.run.lastNote).toBe(prClosedReason(990));
    expect(body.githubSyncedAt).toBe(t);
    const stops = listAuditEvents({ recordId: out.runId, action: "stop" }).rows;
    expect(stops).toHaveLength(1);
    expect(JSON.stringify(stops[0])).toContain(prClosedReason(990));
    expect(listAuditEvents({ recordId: out.runId, action: "record_merge" }).rows).toHaveLength(0);

    const again = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(again.run.status).toBe("stopped");
    expect(listAuditEvents({ recordId: out.runId, action: "stop" }).rows).toHaveLength(1);
  });

  it("stops a run with a recorded PR closed on GitHub even when the session poll fails", async () => {
    stopAll();
    const reporting = prReported();
    const d = { ...deps(), devin: reporting.client, github: githubWith({ contextSha: () => null }) };
    const out = await dispatchRun(admin, request, d);
    const open = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(open.run.status).toBe("running");
    expect(open.run.prUrl).toMatch(/pull\/990$/);

    const unreachable: DevinClient = {
      ...reporting.client,
      async getSession() {
        throw new Error("Devin API 503");
      },
    };
    const closed = { ...d, devin: unreachable, github: githubWith({ closed: true, contextSha: () => null }) };
    const body = (await handleGet(out.runId, admin, closed)).body as RunViewPayload;
    expect(body.run.status).toBe("stopped");
    expect(body.run.lastNote).toBe(prClosedReason(990));
  });

  it("leaves a running run alone while its PR is open", async () => {
    stopAll();
    const devin = prReported();
    const d = { ...deps(), devin: devin.client, github: githubWith({ contextSha: () => null }) };
    const out = await dispatchRun(admin, request, d);

    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.run.status).toBe("running");
    expect(body.run.prUrl).toMatch(/pull\/990$/);
    expect(listAuditEvents({ recordId: out.runId, action: "stop" }).rows).toHaveLength(0);
    expect(listAuditEvents({ recordId: out.runId, action: "record_merge" }).rows).toHaveLength(0);
  });

  it("reports no GitHub sync when the server has no GitHub client", async () => {
    stopAll();
    const d = { ...deps(), devin: prReported().client, github: null };
    const out = await dispatchRun(admin, request, d);
    const body = (await handleGet(out.runId, admin, d)).body as RunViewPayload;
    expect(body.run.status).toBe("running");
    expect(body.githubSyncedAt).toBeNull();
    expect(body.githubNotice).toBeNull();
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

  it("links a run recorded without a session URL to the app page, minus the id's devin- prefix", async () => {
    const id = ulid();
    db.insert(devinRuns)
      .values({
        id,
        operation: "change",
        spec: COMPANIES_HOUSE_CHECK.file,
        tool: "kyc",
        intent: "run recorded before session URLs were stored",
        contextSha256: "f".repeat(64),
        sessionId: "devin-9a8b7c6d",
        sessionUrl: null,
        status: "stopped",
        prUrl: null,
        mergeCommit: null,
        reverses: null,
        requestedBy: admin.id,
        requestedByRole: admin.role,
        approvedBy: null,
        lastNote: null,
        requestedAt: 1,
        updatedAt: 1,
        version: 1,
      })
      .run();

    vi.stubEnv("DEVIN_API_KEY", "test-key");
    try {
      const body = (await handleGet(id, admin, deps())).body as RunViewPayload;
      expect(body.mode).toBe("live");
      expect(body.run.sessionUrl).toBeNull();
      expect(body.sessionUrl).toBe("https://app.devin.ai/sessions/9a8b7c6d");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("POST /api/devin/<runId>", () => {
  /** Write `frames` as the run's recording, as a poll would have left it. */
  function record(runId: string, phaseStatus: string) {
    const frame = JSON.parse(
      JSON.stringify(
        scriptedFrames("change", runId, "0".repeat(64), "0".repeat(40))[0],
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
