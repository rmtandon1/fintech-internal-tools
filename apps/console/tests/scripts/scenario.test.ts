import { beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@console/db";
import { auditLog } from "@console/db-core/engine-schema";
import { registerConstants } from "@console/engine/policy/register";
import { refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { courierOutage } from "../../scripts/scenario";
import { setupHarness } from "../helpers/harness";

const SCENARIO_IDS = like(refunds.id, "rfnd_10%");

function scenarioRows() {
  return db.select().from(refunds).where(SCENARIO_IDS).all();
}

function auditRowsFor(recordId: string) {
  return db
    .select({ id: auditLog.id, action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.recordId, recordId))
    .all();
}

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

describe("courier-outage scenario", () => {
  it("inserts 60 deterministic Fernhill Home refunds and counts live manager routing", () => {
    const now = Date.now();
    const summary = courierOutage(now);

    expect(summary.inserted).toBe(60);
    const managerRows = refundTool
      .list({ filters: { queue: "manager" }, limit: 1000, offset: 0 })
      .rows.filter((row) => row.id.startsWith("rfnd_10") && row.merchant === "Fernhill Home");
    expect(summary.inManagerQueue).toBe(managerRows.length);

    const rows = scenarioRows();
    expect(rows).toHaveLength(60);
    expect(rows.map((r) => r.id).sort()).toEqual(
      Array.from({ length: 60 }, (_, i) => `rfnd_${1001 + i}`),
    );
    for (const r of rows) {
      expect(r.merchant).toBe("Fernhill Home");
      expect(r.reasonCode).toBe("not_received");
      expect(r.currency).toBe("USD");
      expect(r.usdMinor).toBe(r.amountMinor);
      expect(r.amountMinor).toBeGreaterThanOrEqual(3_000);
      expect(r.amountMinor).toBeLessThanOrEqual(45_000);
      expect(r.requestedAt).toBeGreaterThanOrEqual(now - 48 * 60 * 60 * 1000);
      expect(r.requestedAt).toBeLessThanOrEqual(now);
      expect(auditRowsFor(r.id)).toEqual([]);
    }
    expect(new Set(rows.map((r) => r.customerEmail)).size).toBe(60);
    expect(new Set(rows.map((r) => r.cardLast4)).size).toBe(60);
    expect(new Set(rows.map((r) => r.amountMinor)).size).toBe(60);
  });

  it("adds nothing on a second run", () => {
    const rowsBefore = scenarioRows();
    const auditBefore = db.select({ id: auditLog.id }).from(auditLog).all().length;

    const summary = courierOutage();

    expect(summary.inserted).toBe(0);
    expect(scenarioRows()).toEqual(rowsBefore);
    expect(db.select({ id: auditLog.id }).from(auditLog).all().length).toBe(auditBefore);
  });

  it("leaves another merchant's refund alone when it holds a scenario id", () => {
    db.update(refunds)
      .set({ merchant: "Northwind Freight", status: "requested" })
      .where(eq(refunds.id, "rfnd_1060"))
      .run();
    const auditBefore = auditRowsFor("rfnd_1060").length;

    const summary = courierOutage();

    expect(summary.collisions).toEqual(["rfnd_1060"]);
    expect(summary.inserted).toBe(0);
    expect(refundTool.get("rfnd_1060")?.status).toBe("requested");
    expect(auditRowsFor("rfnd_1060")).toHaveLength(auditBefore);
  });
});
