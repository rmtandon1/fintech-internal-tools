import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { db } from "@console/db";
import { registerConstants } from "@console/engine/policy/register";
import type { StructuredOutput } from "@console/tool-automation";
import { getRun, REFUND_CLUSTERING_HOLD } from "@console/tool-automation";
import { devinRuns } from "@console/tool-automation/schema";
import type { BridgeDeps } from "@console/tool-automation/bridge";
import { refundTool } from "@console/tool-refunds";
import { runOffers, sharedPathsTouched } from "@/lib/run-surface";
import { admin, manager, setupHarness } from "../helpers/harness";

function output(paths: string[]): StructuredOutput {
  return {
    phase: "edit",
    phase_status: "running",
    phase_durations_s: {},
    base_commit: null,
    context_sha256: null,
    branch: "devin/run",
    plan_commit: null,
    reuses: [],
    files: paths.map((path) => ({ path, op: "modify", additions: 1, deletions: 0, reason: "x" })),
    verify_steps: [],
    guards: [],
    conflicts: [],
    pr_url: null,
    stopped_by: null,
  };
}

describe("sharedPathsTouched", () => {
  it("names the shared paths the reported files touch", () => {
    expect(
      sharedPathsTouched(output(["tools/kyc/src/index.ts", "apps/console/drizzle/0009_x.sql"])),
    ).toEqual(["apps/console/drizzle/0009_x.sql"]);
  });

  it("is empty for a tools-only diff and for no reported output", () => {
    expect(sharedPathsTouched(output(["tools/kyc/src/index.ts"]))).toEqual([]);
    expect(sharedPathsTouched(null)).toEqual([]);
    expect(sharedPathsTouched(undefined)).toEqual([]);
  });
});

describe("runOffers.reverse", () => {
  const deps: BridgeDeps = {
    devin: null,
    github: null,
    repoRoot: mkdtempSync(join(tmpdir(), "surface-repo-")),
  };

  function mergedChangeRun(): string {
    const id = ulid();
    db.insert(devinRuns)
      .values({
        id,
        operation: "change",
        spec: REFUND_CLUSTERING_HOLD.file,
        tool: "refunds",
        intent: REFUND_CLUSTERING_HOLD.intents.change,
        contextSha256: "f".repeat(64),
        sessionId: null,
        sessionUrl: null,
        status: "merged",
        prUrl: "https://github.com/o/r/pull/42",
        mergeCommit: "d".repeat(40),
        reverses: null,
        requestedBy: admin.id,
        requestedByRole: admin.role,
        approvedBy: null,
        lastNote: null,
        requestedAt: 1,
        updatedAt: 1,
        version: 1,
      })
      .run();
    return id;
  }

  beforeAll(() => {
    setupHarness();
    registerConstants(refundTool.constants ?? []);
  });

  it("offers a manager the undo of a merged change on a domain spec", async () => {
    const run = getRun(mergedChangeRun());
    if (!run) throw new Error("run not stored");
    const offers = await runOffers(run, manager, deps, null, run.prUrl);
    expect(offers.reverse).toEqual({ offered: true });
  });
});
