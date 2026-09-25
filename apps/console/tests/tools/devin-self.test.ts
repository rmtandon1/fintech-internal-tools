import { describe, expect, it } from "vitest";
import {
  DevinApiError,
  type FetchLike,
  getSelf,
  httpDevinClient,
  resolveOrgId,
} from "@console/tool-automation";
import { findPlaybookId, PLAYBOOK_TITLE } from "@console/tool-automation/playbook-registration";

const SELF = {
  principal_type: "service_user",
  service_user_id: "su_1",
  service_user_name: "Devin API",
  org_id: "org-from-key",
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

/** Answers by `METHOD url` prefix and records every request line. */
function recorder(routes: Record<string, () => Response>) {
  const seen: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const line = `${init?.method ?? "GET"} ${url}`;
    seen.push(line);
    const route = Object.entries(routes).find(([k]) => line.startsWith(k));
    return route ? route[1]() : new Response("not found", { status: 404 });
  };
  return { fetchImpl, seen };
}

describe("Devin key-only configuration", () => {
  it("reads the key's principal and organisation from GET /v3/self", async () => {
    const http = recorder({ "GET https://api.devin.ai/v3/self": () => json(SELF) });
    expect(await getSelf("k", http.fetchImpl)).toEqual({
      principalType: "service_user",
      name: "Devin API",
      orgId: "org-from-key",
    });
  });

  it("reports a rejected key as a Devin API error", async () => {
    const http = recorder({ "GET https://api.devin.ai/v3/self": () => json({ detail: "bad key" }, 401) });
    await expect(getSelf("k", http.fetchImpl)).rejects.toBeInstanceOf(DevinApiError);
  });

  it("prefers a configured org and never calls /self for it", async () => {
    const http = recorder({});
    expect(await resolveOrgId({ apiKey: "k", orgId: "org-env" }, http.fetchImpl)).toBe("org-env");
    expect(http.seen).toEqual([]);
  });

  it("refuses a key with no organisation", async () => {
    const http = recorder({ "GET https://api.devin.ai/v3/self": () => json({ ...SELF, org_id: null }) });
    await expect(resolveOrgId({ apiKey: "k" }, http.fetchImpl)).rejects.toThrow("DEVIN_ORG_ID");
  });

  it("the client resolves the org once from the key, then reuses it", async () => {
    const http = recorder({
      "GET https://api.devin.ai/v3/self": () => json(SELF),
      "GET https://api.devin.ai/v3/organizations/org-from-key/sessions/s1": () =>
        json({ status: "running", status_detail: null, structured_output: null }),
    });
    const client = httpDevinClient({ apiKey: "k" }, http.fetchImpl);
    await client.getSession("s1");
    await client.getSession("s1");
    expect(http.seen).toEqual([
      "GET https://api.devin.ai/v3/self",
      "GET https://api.devin.ai/v3/organizations/org-from-key/sessions/s1",
      "GET https://api.devin.ai/v3/organizations/org-from-key/sessions/s1",
    ]);
  });

  it("retries the org lookup after a failure", async () => {
    let selfCalls = 0;
    const http = recorder({
      "GET https://api.devin.ai/v3/self": () => (++selfCalls === 1 ? json({}, 503) : json(SELF)),
      "GET https://api.devin.ai/v3/organizations/org-from-key/sessions/s1": () =>
        json({ status: "running", status_detail: null, structured_output: null }),
    });
    const client = httpDevinClient({ apiKey: "k" }, http.fetchImpl);
    await expect(client.getSession("s1")).rejects.toBeInstanceOf(DevinApiError);
    await expect(client.getSession("s1")).resolves.toMatchObject({ status: "running" });
    expect(selfCalls).toBe(2);
  });

  it("finds the org playbook by title without writing, or reports none", async () => {
    const list = (items: unknown[]) =>
      recorder({
        "GET https://api.devin.ai/v3/organizations/org-1/playbooks": () =>
          json({ items, has_next_page: false }),
      });
    const found = list([{ title: PLAYBOOK_TITLE, org_id: "org-1", playbook_id: "pb-1" }]);
    expect(await findPlaybookId("k", "org-1", found.fetchImpl)).toBe("pb-1");
    expect(found.seen.every((line) => line.startsWith("GET "))).toBe(true);

    const none = list([{ title: "Something else", org_id: "org-1", playbook_id: "pb-2" }]);
    expect(await findPlaybookId("k", "org-1", none.fetchImpl)).toBeNull();
  });
});
