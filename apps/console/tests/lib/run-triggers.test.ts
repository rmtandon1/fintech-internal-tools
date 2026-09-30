import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerConstants } from "@console/engine/policy/register";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { modeTriggers } from "@/lib/run-triggers";
import { admin, manager, setupHarness } from "../helpers/harness";

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

describe("modeTriggers", () => {
  it("offers to start Chargebacks from its committed export, for the admin only", () => {
    const [t] = modeTriggers("chargebacks", admin);
    expect(t.offer?.evidence.map((row) => row.id)).toContain("Data/disputes.csv");
    expect(modeTriggers("chargebacks", manager)[0]).toMatchObject({ offer: null });
    expect(modeTriggers("wire_release", admin)).toEqual([]);
  });
});
