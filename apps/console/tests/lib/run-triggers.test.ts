import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerConstants } from "@console/engine/policy/register";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { modeTriggers, recordTriggers } from "@/lib/run-triggers";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsAgent,
  refundsManager,
  setupHarness,
} from "../helpers/harness";

const emptyRoot = process.env.REPO_ROOT;

beforeAll(() => {
  // A throwaway git repo holding only the committed export: the offer reads
  // the base commit and the export's files, and no real .env is in reach.
  const root = mkdtempSync(join(tmpdir(), "triggers-root-"));
  const exportDir = join("fixtures", "power-apps", "chargebacks");
  cpSync(join(resolve(__dirname, "../../../.."), exportDir), join(root, exportDir), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-q", "-m", "export");
  git("remote", "add", "origin", "https://github.com/example/console.git");
  process.env.REPO_ROOT = root;
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
});

afterAll(() => {
  process.env.REPO_ROOT = emptyRoot;
});

function kyc(id: string) {
  const record = kycTool.get(id);
  if (!record) throw new Error(`no ${id}`);
  return record;
}

function refund(id: string) {
  const record = refundTool.get(id);
  if (!record) throw new Error(`no ${id}`);
  return record;
}

describe("recordTriggers", () => {
  it("offers the Companies House check on a UK business case to the KYC manager", () => {
    const [t] = recordTriggers("kyc", kyc("kyc_0003"), kycManager);
    expect(t.label).toBe("Ask Devin to add a check");
    expect(t.blocked).toBeNull();
    expect(t.offer?.evidenceIds).toEqual(["kyc_0003"]);
    expect(t.offer?.intent).toMatch(/Companies House/);
  });

  it("offers it on every UK business case, including the low-risk one the demo uses", () => {
    expect(recordTriggers("kyc", kyc("kyc_0104"), kycManager)[0]?.offer?.evidenceIds).toEqual([
      "kyc_0104",
    ]);
  });

  it("shows nothing to a KYC reviewer, and nothing on a personal customer", () => {
    expect(recordTriggers("kyc", kyc("kyc_0003"), kycReviewer)).toEqual([]);
    expect(recordTriggers("kyc", kyc("kyc_0001"), kycManager)).toEqual([]);
  });

  it("offers two-person approval on a refund over the admin line to the admin only", () => {
    const [forAdmin] = recordTriggers("refunds", refund("rfnd_0015"), admin);
    expect(forAdmin.offer?.scope).toBe("engine");
    const [forManager] = recordTriggers("refunds", refund("rfnd_0015"), refundsManager);
    expect(forManager).toMatchObject({ offer: null, blocked: "Only an admin can ask for this" });
    expect(recordTriggers("refunds", refund("rfnd_0015"), refundsAgent)).toEqual([]);
    expect(recordTriggers("refunds", refund("rfnd_0001"), admin)).toEqual([]);
  });
});

describe("modeTriggers", () => {
  it("offers to build Chargebacks from its committed export, for the admin only", () => {
    const [t] = modeTriggers("chargebacks", admin);
    expect(t.offer?.evidence.map((row) => row.id)).toContain("Data/disputes.csv");
    expect(modeTriggers("chargebacks", refundsManager)[0]).toMatchObject({ offer: null });
    expect(modeTriggers("wire_release", admin)).toEqual([]);
  });
});
