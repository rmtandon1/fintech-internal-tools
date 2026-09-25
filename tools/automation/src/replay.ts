import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeTime } from "ulid";
import type { CreatedSession, CreateSessionRequest, DevinClient, SessionSnapshot } from "./devin-api";
import type { ChecksState, GitHubClient, PullRef, PullState } from "./github-api";
import { ReplayFile, type ReplayFrame } from "./run-files";
import { IMPLEMENTATION_KINDS, type RunKind } from "./specs";
import implementationFixture from "../fixtures/implementation.replay.json";
import reversalFixture from "../fixtures/reversal.replay.json";

/**
 * Replay mode: the Devin and GitHub clients the console uses when no API
 * credentials are set. A dispatched session plays a recorded `replay.json`
 * fixture on a compressed timer, so the governed path — dispatch, poll,
 * approve, merge — runs unchanged while every surface labels the data
 * "Replay". Nothing here touches the network.
 */

export type BridgeMode = "live" | "replay";

const SESSION_PREFIX = "replay-";

/** Fixture frames carry `at_ms` as an offset from dispatch, not a clock time. */
export const REPLAY_FIXTURES: Record<"IMPLEMENTATION" | "REVERSAL", ReplayFrame[]> = {
  IMPLEMENTATION: ReplayFile.parse(implementationFixture),
  REVERSAL: ReplayFile.parse(reversalFixture),
};

export function replayFixtureFor(kind: RunKind): ReplayFrame[] {
  return kind === "REVERSAL" || !IMPLEMENTATION_KINDS.includes(kind)
    ? REPLAY_FIXTURES.REVERSAL
    : REPLAY_FIXTURES.IMPLEMENTATION;
}

export function isReplaySession(sessionId: string): boolean {
  return sessionId.startsWith(SESSION_PREFIX);
}

function tag(req: CreateSessionRequest, name: string): string | undefined {
  return req.tags.find((t) => t.startsWith(`${name}:`))?.slice(name.length + 1);
}

/** `replay-<i|r>-<runId>`: the kind and the ULID's timestamp are all the client needs. */
function parseSession(
  sessionId: string,
): { fixture: ReplayFrame[]; startedAt: number; runId: string } | null {
  const m = /^replay-([ir])-([0-9A-HJKMNP-TV-Z]{26})$/.exec(sessionId);
  if (!m) return null;
  return {
    fixture: m[1] === "r" ? REPLAY_FIXTURES.REVERSAL : REPLAY_FIXTURES.IMPLEMENTATION,
    startedAt: decodeTime(m[2]),
    runId: m[2],
  };
}

/** The fixture frame in force `elapsedMs` after dispatch: the last one whose offset has passed. */
export function frameAt(fixture: readonly ReplayFrame[], elapsedMs: number): ReplayFrame {
  let current = fixture[0];
  for (const frame of fixture) {
    if (frame.at_ms <= elapsedMs) current = frame;
    else break;
  }
  return current;
}

/** What the replay clients read from the governed record: nothing else gates them. */
export interface ReplayLookup {
  /** The run's current status, or null when unknown. */
  runStatus: (runId: string) => string | null;
  /** The run whose approved PR is `/pull/<number>`, or null when none is. */
  runForPull: (prNumber: number) => { id: string; status: string } | null;
  now?: () => number;
}

const APPROVED = new Set(["approved", "merged"]);

/** Frames at or past the merge are held back until an engineer has approved the run. */
function gate(fixture: ReplayFrame[], approved: boolean): ReplayFrame[] {
  return approved ? fixture : fixture.filter((f) => f.structured_output.phase !== "merge");
}

export function replayDevinClient(lookup: ReplayLookup): DevinClient {
  const now = lookup.now ?? Date.now;
  return {
    async createSession(req): Promise<CreatedSession> {
      const runId = tag(req, "run");
      if (!runId) throw new Error("replay session needs a run:<id> tag");
      const kind = tag(req, "kind") ?? "";
      const sessionId = `${SESSION_PREFIX}${kind === "REVERSAL" ? "r" : "i"}-${runId}`;
      return { sessionId, url: `replay:${runId}` };
    },
    async getSession(sessionId): Promise<SessionSnapshot> {
      const parsed = parseSession(sessionId);
      if (!parsed) throw new Error(`not a replay session: ${sessionId}`);
      const approved = APPROVED.has(lookup.runStatus(parsed.runId) ?? "");
      const frame = frameAt(gate(parsed.fixture, approved), now() - parsed.startedAt);
      return {
        status: frame.status,
        statusDetail: frame.status_detail,
        structuredOutput: frame.structured_output,
      };
    },
    async sendMessage() {},
    async terminateSession() {},
  };
}

/**
 * Stands in for GitHub once the fixture has opened its PR: checks are green,
 * the branch carries the very `context.json` the console wrote, and the PR
 * reads as merged only after the console has recorded an approval for the
 * run that owns it and the fixture's merge frame has come due.
 */
export function replayGitHubClient(repoRoot: string, lookup: ReplayLookup): GitHubClient {
  const now = lookup.now ?? Date.now;
  const last = (fixture: ReplayFrame[]) => fixture[fixture.length - 1];
  const fixtureFor = (pr: PullRef): ReplayFrame[] =>
    Object.values(REPLAY_FIXTURES).find((f) =>
      last(f).structured_output.pr_url?.endsWith(`/pull/${pr.number}`),
    ) ?? REPLAY_FIXTURES.IMPLEMENTATION;
  return {
    async getPull(pr): Promise<PullState> {
      const fixture = fixtureFor(pr);
      const out = last(fixture).structured_output;
      const owner = lookup.runForPull(pr.number);
      const merged =
        owner !== null &&
        APPROVED.has(owner.status) &&
        now() - decodeTime(owner.id) >= last(fixture).at_ms;
      return {
        headSha: out.plan_commit ?? "0".repeat(40),
        headRef: out.branch ?? "replay",
        merged,
        mergeCommit: merged ? (out.merge_commit ?? null) : null,
      };
    },
    async getChecks(): Promise<ChecksState> {
      return { green: true, summary: "verify: passed (replay)" };
    },
    async fileSha256(_pr, _ref, path) {
      const file = join(repoRoot, path);
      if (!existsSync(file)) return null;
      return createHash("sha256").update(readFileSync(file)).digest("hex");
    },
    async approvePull() {},
  };
}
