import { z } from "zod";

/**
 * Server-only client for the Devin v3 API. The console calls it after a
 * governed intent has committed, never inside one, and never from the
 * browser. `fetch` is injected so tests substitute a recorder and `pnpm
 * verify` never reaches the network.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DevinCredentials {
  apiKey: string;
  orgId: string;
  baseUrl?: string;
}

export interface CreateSessionRequest {
  prompt: string;
  title: string;
  tags: string[];
  /** Filename and contents of the attachment handed to the session. */
  attachment: { name: string; body: string };
  structuredOutputSchema: Record<string, unknown>;
  /** Run id for replay clients; `httpDevinClient` ignores it (tags carry it live). */
  runId?: string;
  playbookId?: string;
  maxAcuLimit?: number;
}

export interface CreatedSession {
  sessionId: string;
  /** Null for replay sessions: there is no app.devin.ai page to open. */
  url: string | null;
}

export interface SessionSnapshot {
  status: string;
  statusDetail: string | null;
  /** Raw `structured_output`; the bridge validates it against `StructuredOutput`. */
  structuredOutput: unknown;
}

export interface DevinClient {
  createSession(req: CreateSessionRequest): Promise<CreatedSession>;
  getSession(sessionId: string): Promise<SessionSnapshot>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  terminateSession(sessionId: string): Promise<void>;
}

interface CallInit {
  method: string;
  headers?: Record<string, string>;
  body?: string | FormData;
}

export const DEVIN_API_BASE = "https://api.devin.ai/v3";

export class DevinApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail: string,
  ) {
    super(`Devin API ${status} on ${path}: ${detail}`);
    this.name = "DevinApiError";
  }
}

export function httpDevinClient(creds: DevinCredentials, fetchImpl: FetchLike): DevinClient {
  const base = (creds.baseUrl ?? DEVIN_API_BASE).replace(/\/$/, "");
  const org = `${base}/organizations/${encodeURIComponent(creds.orgId)}`;
  const headers = { Authorization: `Bearer ${creds.apiKey}` };

  async function call(path: string, init: CallInit): Promise<unknown> {
    const res = await fetchImpl(path, { ...init, headers: { ...headers, ...init.headers } });
    if (!res.ok) throw new DevinApiError(res.status, path, await res.text().catch(() => ""));
    const text = await res.text();
    return text.length > 0 ? JSON.parse(text) : null;
  }

  async function uploadAttachment(name: string, body: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([body], { type: "application/json" }), name);
    const json = await call(`${org}/attachments`, { method: "POST", body: form });
    const url = field(json, "url");
    if (typeof url !== "string") throw new Error("Devin attachment upload returned no url");
    return url;
  }

  return {
    async createSession(req) {
      const attachmentUrl = await uploadAttachment(req.attachment.name, req.attachment.body);
      const json = await call(`${org}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: req.prompt,
          title: req.title,
          tags: req.tags,
          attachment_urls: [attachmentUrl],
          structured_output_schema: req.structuredOutputSchema,
          structured_output_required: true,
          ...(req.playbookId ? { playbook_id: req.playbookId } : {}),
          ...(req.maxAcuLimit !== undefined ? { max_acu_limit: req.maxAcuLimit } : {}),
        }),
      });
      const sessionId = field(json, "session_id");
      const url = field(json, "url");
      if (typeof sessionId !== "string" || typeof url !== "string") {
        throw new Error("Devin session creation returned no session_id");
      }
      return { sessionId, url };
    },
    async getSession(sessionId) {
      const json = await call(`${org}/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
      const status = field(json, "status");
      if (typeof status !== "string") throw new Error("Devin session read returned no status");
      const detail = field(json, "status_detail");
      return {
        status,
        statusDetail: typeof detail === "string" ? detail : null,
        structuredOutput: field(json, "structured_output") ?? null,
      };
    },
    async sendMessage(sessionId, message) {
      await call(`${org}/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    },
    async terminateSession(sessionId) {
      await call(`${org}/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    },
  };
}

const JsonObject = z.record(z.string(), z.unknown());

export function field(json: unknown, key: string): unknown {
  const parsed = JsonObject.safeParse(json);
  return parsed.success ? parsed.data[key] : undefined;
}
