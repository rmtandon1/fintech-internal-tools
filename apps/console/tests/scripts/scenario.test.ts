import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
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
    .select({ id: auditLog.id, actorRole: auditLog.actorRole, action: auditLog.action })
    .from(auditLog)
    .where(and(eq(auditLog.tool, "refunds"), eq(auditLog.recordId, recordId)))
    .all();
}

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

describe("courier-outage scenario", () => {
  it("inserts 60 deterministic Fernhill Home refunds and submits each through the engine", () => {
    const now = Date.now();
    const summary = courierOutage(now);

    expect(summary.inserted).toBe(60);
    expect(summary.submitted).toBe(60);
    expect(summary.applied + summary.pendingApproval + summary.denied).toBe(60);
    expect(summary.errors).toBe(0);

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
    }
    expect(new Set(rows.map((r) => r.customerEmail)).size).toBe(60);
    expect(new Set(rows.map((r) => r.cardLast4)).size).toBe(60);
    expect(new Set(rows.map((r) => r.amountMinor)).size).toBe(60);

    for (const r of rows) {
      const audit = auditRowsFor(r.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorRole: "refunds_agent", action: "execute" });
    }
  });

  it("adds nothing on a second run", () => {
    const rowsBefore = scenarioRows();
    const auditBefore = db.select({ id: auditLog.id }).from(auditLog).all().length;

    const summary = courierOutage();

    expect(summary.inserted).toBe(0);
    expect(summary.submitted).toBe(0);
    expect(summary.skipped).toBe(60);
    expect(scenarioRows()).toEqual(rowsBefore);
    expect(db.select({ id: auditLog.id }).from(auditLog).all().length).toBe(auditBefore);
  });
});
