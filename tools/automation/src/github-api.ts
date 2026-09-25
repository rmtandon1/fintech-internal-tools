import { createHash } from "node:crypto";
import { z } from "zod";
import { type FetchLike, field } from "./devin-api";

/**
 * Server-only client for the GitHub REST API. `approve_pr` reads its
 * `checksGreen` and `branchContextSha256` inputs from here, never from the
 * browser, and the approving review is submitted only after that intent has
 * committed. `fetch` is injected for the same reason as the Devin client.
 */

export interface PullRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PullState {
  headSha: string;
  headRef: string;
  merged: boolean;
  mergeCommit: string | null;
}

export interface ChecksState {
  /** True only when every check run and commit status on the head is green. */
  green: boolean;
  summary: string;
}

export interface GitHubClient {
  getPull(pr: PullRef): Promise<PullState>;
  getChecks(pr: PullRef, headSha: string): Promise<ChecksState>;
  /** SHA-256 of a file's contents at `ref`, or null when the path is absent. */
  fileSha256(pr: PullRef, ref: string, path: string): Promise<string | null>;
  approvePull(pr: PullRef, headSha: string, body: string): Promise<void>;
}

export const GITHUB_API_BASE = "https://api.github.com";

export function parsePullUrl(url: string): PullRef | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(url);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail: string,
  ) {
    super(`GitHub API ${status} on ${path}: ${detail}`);
    this.name = "GitHubApiError";
  }
}

const Pull = z.object({
  head: z.object({ sha: z.string().min(1), ref: z.string().min(1) }),
  merged: z.boolean(),
  merge_commit_sha: z.string().nullable(),
});

const CheckRuns = z.object({
  check_runs: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
    }),
  ),
});

const CombinedStatus = z.object({
  state: z.string(),
  total_count: z.number().int(),
});

const Contents = z.object({
  encoding: z.string(),
  content: z.string(),
});

const GREEN_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

export function httpGitHubClient(token: string, fetchImpl: FetchLike, baseUrl = GITHUB_API_BASE): GitHubClient {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  async function call(path: string, init: { method: string; body?: string }): Promise<unknown> {
    const res = await fetchImpl(`${base}${path}`, {
      method: init.method,
      headers: init.body ? { ...headers, "Content-Type": "application/json" } : headers,
      body: init.body,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new GitHubApiError(res.status, path, await res.text().catch(() => ""));
    const text = await res.text();
    return text.length > 0 ? JSON.parse(text) : null;
  }

  const repoPath = (pr: PullRef) => `/repos/${pr.owner}/${pr.repo}`;

  return {
    async getPull(pr) {
      const json = await call(`${repoPath(pr)}/pulls/${pr.number}`, { method: "GET" });
      const pull = Pull.parse(json);
      return {
        headSha: pull.head.sha,
        headRef: pull.head.ref,
        merged: pull.merged,
        mergeCommit: pull.merged ? pull.merge_commit_sha : null,
      };
    },
    async getChecks(pr, headSha) {
      const [runsJson, statusJson] = await Promise.all([
        call(`${repoPath(pr)}/commits/${headSha}/check-runs?per_page=100`, { method: "GET" }),
        call(`${repoPath(pr)}/commits/${headSha}/status`, { method: "GET" }),
      ]);
      const runs = CheckRuns.parse(runsJson).check_runs;
      const status = CombinedStatus.parse(statusJson);
      const pending = runs.filter((r) => r.status !== "completed").map((r) => r.name);
      const failed = runs
        .filter((r) => r.status === "completed" && !GREEN_CONCLUSIONS.has(r.conclusion ?? ""))
        .map((r) => r.name);
      const statusGreen = status.total_count === 0 || status.state === "success";
      const green = runs.length > 0 && pending.length === 0 && failed.length === 0 && statusGreen;
      const parts = [
        `${runs.length} check run(s)`,
        pending.length ? `pending: ${pending.join(", ")}` : null,
        failed.length ? `failed: ${failed.join(", ")}` : null,
        status.total_count > 0 ? `commit status ${status.state}` : null,
      ].filter((p): p is string => p !== null);
      return { green, summary: parts.join("; ") };
    },
    async fileSha256(pr, ref, path) {
      const json = await call(
        `${repoPath(pr)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
        { method: "GET" },
      );
      if (json === null) return null;
      const file = Contents.parse(json);
      if (file.encoding !== "base64") throw new Error(`unexpected contents encoding ${file.encoding}`);
      const bytes = Buffer.from(file.content.replace(/\n/g, ""), "base64");
      return createHash("sha256").update(bytes).digest("hex");
    },
    async approvePull(pr, headSha, body) {
      const json = await call(`${repoPath(pr)}/pulls/${pr.number}/reviews`, {
        method: "POST",
        body: JSON.stringify({ commit_id: headSha, event: "APPROVE", body }),
      });
      if (field(json, "state") !== "APPROVED") {
        throw new Error("GitHub did not record an approving review");
      }
    },
  };
}
