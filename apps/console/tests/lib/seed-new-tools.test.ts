import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@console/db";
import type { ToolDeclaration } from "@console/engine/types";
import { flagTool } from "@console/tool-flags";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { eq } from "drizzle-orm";
import { seedNewTools } from "@/lib/seed-new-tools";
import { TOOLS } from "@/registry";
import { setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  for (const tool of [refundTool, kycTool, flagTool]) {
    tool.seed?.();
  }
});

/** A declaration whose queue is an in-memory array. */
function fakeTool(rows: { id: string }[]): ToolDeclaration {
  return {
    ...refundTool,
    name: "fake",
    list: ({ limit }) => ({ rows: rows.slice(0, limit), total: rows.length }),
    get: (id) => rows.find((r) => r.id === id) ?? null,
    seed: () => {
      rows.push({ id: "fake_1" }, { id: "fake_2" }, { id: "fake_3" });
    },
  } as ToolDeclaration;
}

describe("seedNewTools", () => {
  it("seeds only the tool whose queue is empty, without touching live rows", () => {
    db.update(refunds).set({ status: "executing" }).where(eq(refunds.id, "rfnd_0001")).run();

    const rows: { id: string }[] = [];
    const seeded = seedNewTools([...TOOLS, fakeTool(rows)]);

    expect(seeded).toEqual(["fake"]);
    expect(rows).toHaveLength(3);
    // Automation's seed is a no-op: it is never reported.
    expect(seeded).not.toContain("automation");
    // Refunds already had rows, so it was skipped and the edited row survived.
    expect(refundTool.get("rfnd_0001")?.status).toBe("executing");
    // A second call has nothing left to seed.
    expect(seedNewTools([...TOOLS, fakeTool(rows)])).toEqual([]);
  });
});
