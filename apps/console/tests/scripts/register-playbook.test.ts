import { describe, expect, it } from "vitest";
import { PLAYBOOK_TITLE, registerPlaybook } from "@console/tool-automation/playbook-registration";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Devin playbook registration", () => {
  it("creates an org playbook with the file body and the structured output schema", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      requests.push({ url, init });
      return requests.length === 1
        ? json({ items: [], has_next_page: false })
        : json({ playbook_id: "playbook-created" });
    };

    expect(await registerPlaybook("test-key", "org-test", fetchImpl, "https://example.test/v3")).toBe(
      "playbook-created",
    );
    expect(requests.map(({ init }) => init?.method)).toEqual(["GET", "POST"]);
    expect(requests[1].url).toBe("https://example.test/v3/organizations/org-test/playbooks");
    expect(requests[1].init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    const body = JSON.parse(String(requests[1].init?.body));
    expect(body.title).toBe(PLAYBOOK_TITLE);
    expect(body.body).toContain("## Reversal");
    expect(body.structured_output_schema.properties).toHaveProperty("phase");
  });

  it("finds an existing org playbook on a later page and updates its id", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
      requests.push({ url, init });
      if (requests.length === 1) {
        return json({
          items: [{ title: PLAYBOOK_TITLE, org_id: "org-other", playbook_id: "playbook-other" }],
          has_next_page: true,
          end_cursor: "next",
        });
      }
      if (requests.length === 2) {
        return json({
          items: [{ title: PLAYBOOK_TITLE, org_id: "org-test", playbook_id: "playbook-existing" }],
          has_next_page: false,
        });
      }
      return json({ playbook_id: "playbook-existing" });
    };

    expect(await registerPlaybook("test-key", "org-test", fetchImpl)).toBe("playbook-existing");
    expect(requests.map(({ init }) => init?.method)).toEqual(["GET", "GET", "PUT"]);
    expect(requests[1].url).toContain("after=next");
    expect(requests[2].url).toMatch(/\/playbooks\/playbook-existing$/);
  });

  it("rejects missing credentials and duplicate titles without writing", async () => {
    const fetchImpl = async (): Promise<Response> =>
      json({
        items: [
          { title: PLAYBOOK_TITLE, org_id: "org-test", playbook_id: "playbook-a" },
          { title: PLAYBOOK_TITLE, org_id: "org-test", playbook_id: "playbook-b" },
        ],
        has_next_page: false,
      });
    await expect(registerPlaybook("", "org-test", fetchImpl)).rejects.toThrow("DEVIN_API_KEY");
    await expect(registerPlaybook("test-key", "org-test", fetchImpl)).rejects.toThrow("Multiple org playbooks");
  });
});
