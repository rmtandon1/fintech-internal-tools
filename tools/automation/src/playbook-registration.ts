import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEVIN_API_BASE, field, type FetchLike } from "./devin-api";
import { STRUCTURED_OUTPUT_JSON_SCHEMA } from "./run-files";

export const PLAYBOOK_TITLE = "Governed console run";

const playbookPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.devin/run-protocol.playbook.md");

export async function registerPlaybook(
  apiKey: string,
  orgId: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = DEVIN_API_BASE,
): Promise<string> {
  if (!apiKey || !orgId) throw new Error("Set DEVIN_API_KEY and DEVIN_ORG_ID before registering the playbook");
  const endpoint = `${baseUrl.replace(/\/$/, "")}/organizations/${encodeURIComponent(orgId)}/playbooks`;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  async function request(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchImpl(url, { ...init, headers });
    if (!response.ok) throw new Error(`Devin playbook API returned HTTP ${response.status}`);
    return response.json();
  }

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

  const url = existingId ? `${endpoint}/${encodeURIComponent(existingId)}` : endpoint;
  const result = await request(url, {
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
