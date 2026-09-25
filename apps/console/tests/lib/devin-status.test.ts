import { describe, expect, it } from "vitest";
import type { FetchLike } from "@console/tool-automation";
import { devinMode, devinStatus } from "@/lib/devin-status";

const SELF = {
  principal_type: "service_user",
  service_user_id: "su_1",
  service_user_name: "Devin API",
  org_id: "org-from-key",
};

function counting(respond: () => Response) {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    return respond();
  };
  return { fetchImpl, calls: () => calls };
}

const ok = () => new Response(JSON.stringify(SELF), { status: 200 });

describe("Devin status", () => {
  it("is simulation without a key, and makes no request", async () => {
    const http = counting(ok);
    expect(devinMode({})).toBe("simulation");
    const status = await devinStatus({}, http.fetchImpl);
    expect(status).toMatchObject({ configured: false, mode: "simulation", orgId: null, error: null });
    expect(http.calls()).toBe(0);
  });

  it("is live with a key, resolves the org from it and never echoes the key", async () => {
    const http = counting(ok);
    const env = { DEVIN_API_KEY: "cog_status_test_key_1", GITHUB_TOKEN: "t" };
    expect(devinMode(env)).toBe("live");
    const status = await devinStatus(env, http.fetchImpl, 1_000);
    expect(status).toEqual({
      configured: true,
      mode: "live",
      orgId: "org-from-key",
      orgSource: "key",
      principal: "service_user · Devin API",
      github: true,
      error: null,
    });
    expect(JSON.stringify(status)).not.toContain(env.DEVIN_API_KEY);

    await devinStatus(env, http.fetchImpl, 30_000);
    expect(http.calls()).toBe(1);
    await devinStatus(env, http.fetchImpl, 70_000);
    expect(http.calls()).toBe(2);
  });

  it("prefers DEVIN_ORG_ID over the key's org", async () => {
    const env = { DEVIN_API_KEY: "cog_status_test_key_2", DEVIN_ORG_ID: "org-env" };
    const status = await devinStatus(env, counting(ok).fetchImpl);
    expect(status).toMatchObject({ orgId: "org-env", orgSource: "DEVIN_ORG_ID", github: false });
  });

  it("stays live and reports why when the key is rejected, without caching the failure", async () => {
    const http = counting(() => new Response("bad key", { status: 401 }));
    const env = { DEVIN_API_KEY: "cog_status_test_key_3" };
    const status = await devinStatus(env, http.fetchImpl);
    expect(status).toMatchObject({ configured: true, mode: "live", orgId: null, principal: null });
    expect(status.error).toContain("401");
    await devinStatus(env, http.fetchImpl);
    expect(http.calls()).toBe(2);
  });
});
