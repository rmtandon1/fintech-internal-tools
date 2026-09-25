import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEVIN_API_BASE, field, type FetchLike } from "./devin-api";
import { STRUCTURED_OUTPUT_JSON_SCHEMA } from "./run-files";

export const PLAYBOOK_TITLE = "Governed console run";

const playbookPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.devin/run-protocol.playbook.md");

function playbooksEndpoint(orgId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/organizations/${encodeURIComponent(orgId)}/playbooks`;
}

function requester(apiKey: string, fetchImpl: FetchLike) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return async (url: string, init: RequestInit): Promise<unknown> => {
    const response = await fetchImpl(url, { ...init, headers });
    if (!response.ok) throw new Error(`Devin playbook API returned HTTP ${response.status}`);
    return response.json();
  };
}

/**
 * The id of the org playbook titled `PLAYBOOK_TITLE`, or null when there is
 * none. Read-only: dispatch uses it when `DEVIN_PLAYBOOK_ID` is not set.
 */
export async function findPlaybookId(
  apiKey: string,
  orgId: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = DEVIN_API_BASE,
): Promise<string | null> {
  const endpoint = playbooksEndpoint(orgId, baseUrl);
  const request = requester(apiKey, fetchImpl);
  let cursor: string | null = null;
  let existingId: string | null = null;
  do {
    const url = new URL(endpoint);
    if (cursor) url.searchParams.set("after", cursor);
    const page = await request(url.toString(), { method: "GET" });
    const items = field(page, "items");
    if (!Array.isArray(items)) throw new Error("Devin playbook list has no items");
    for (const item of items) {
      if (field(item, "title") !== PLAYBOOK_TITLE || field(item, "org_id") !== orgId) continue;
      const id = field(item, "playbook_id");
      if (typeof id !== "string") throw new Error("Devin playbook has no id");
      if (existingId) throw new Error(`Multiple org playbooks named ${PLAYBOOK_TITLE}`);
      existingId = id;
    }
    if (field(page, "has_next_page") !== true) break;
    const next = field(page, "end_cursor");
    if (typeof next !== "string" || !next || next === cursor) {
      throw new Error("Devin playbook list has no next cursor");
    }
    cursor = next;
  } while (true);
  return existingId;
}

export async function registerPlaybook(
  apiKey: string,
  orgId: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = DEVIN_API_BASE,
): Promise<string> {
  if (!apiKey || !orgId) throw new Error("Set DEVIN_API_KEY before registering the playbook");
  const endpoint = playbooksEndpoint(orgId, baseUrl);
  const existingId = await findPlaybookId(apiKey, orgId, fetchImpl, baseUrl);

  const url = existingId ? `${endpoint}/${encodeURIComponent(existingId)}` : endpoint;
  const result = await requester(apiKey, fetchImpl)(url, {
    method: existingId ? "PUT" : "POST",
    body: JSON.stringify({
      title: PLAYBOOK_TITLE,
      body: readFileSync(playbookPath, "utf8"),
      structured_output_schema: STRUCTURED_OUTPUT_JSON_SCHEMA,
    }),
  });
  const id = field(result, "playbook_id");
  if (typeof id !== "string") throw new Error("Devin playbook response has no playbook_id");
  return id;
}
