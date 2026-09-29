import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { registerConstants } from "@console/engine/policy/register";
import { COMPANIES_HOUSE_CHECK } from "@console/tool-automation";
import { devinRuns } from "@console/tool-automation/schema";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { modeTriggers, recordTriggers } from "@/lib/run-triggers";
import {
  admin,
  manager,
  analyst,
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

describe("recordTriggers", () => {
  it("offers the Companies House check on a UK business case to the manager", () => {
    const [t] = recordTriggers("kyc", kyc("kyc_0003"), manager);
    expect(t.label).toBe("Ask Devin to add a check");
    expect(t.blocked).toBeNull();
    expect(t.offer?.evidenceIds).toEqual(["kyc_0003"]);
    expect(t.offer?.intent).toMatch(/Companies House/);
  });

  it("offers it on every UK business case, including the low-risk one the demo uses", () => {
    expect(recordTriggers("kyc", kyc("kyc_0104"), manager)[0]?.offer?.evidenceIds).toEqual([
      "kyc_0104",
    ]);
  });

  it("shows nothing to an analyst, and nothing on a personal customer", () => {
    expect(recordTriggers("kyc", kyc("kyc_0003"), analyst)).toEqual([]);
    expect(recordTriggers("kyc", kyc("kyc_0001"), manager)).toEqual([]);
  });

  it("opens the run in flight instead of offering the check again", () => {
    const id = ulid();
    db.insert(devinRuns)
      .values({
        id,
        operation: "change",
        spec: COMPANIES_HOUSE_CHECK.file,
        tool: "kyc",
        intent: "Add the Companies House check",
        contextSha256: "f".repeat(64),
        sessionId: null,
        sessionUrl: null,
        status: "running",
        prUrl: null,
        mergeCommit: null,
        reverses: null,
        requestedBy: manager.id,
        requestedByRole: manager.role,
        approvedBy: null,
        lastNote: null,
        requestedAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      })
      .run();

    expect(recordTriggers("kyc", kyc("kyc_0003"), manager)[0]).toMatchObject({
      offer: null,
      blocked: null,
      run: { id, status: "Devin working" },
    });
    expect(recordTriggers("kyc", kyc("kyc_0104"), manager)[0]).toMatchObject({
      run: { id, status: "Devin working" },
    });

    db.update(devinRuns).set({ status: "stopped" }).where(eq(devinRuns.id, id)).run();
    const [t] = recordTriggers("kyc", kyc("kyc_0003"), manager);
    expect(t.offer?.evidenceIds).toEqual(["kyc_0003"]);
    expect(t.run).toBeNull();
  });

});

describe("modeTriggers", () => {
  it("offers to start Chargebacks from its committed export, for the admin only", () => {
    const [t] = modeTriggers("chargebacks", admin);
    expect(t.offer?.evidence.map((row) => row.id)).toContain("Data/disputes.csv");
    expect(modeTriggers("chargebacks", manager)[0]).toMatchObject({ offer: null });
    expect(modeTriggers("wire_release", admin)).toEqual([]);
  });
});
