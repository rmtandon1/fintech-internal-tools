import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { LinkedActivity } from "@console/engine/types";
import { kycTool, type KycCase } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { db } from "@console/db";
import { eq } from "drizzle-orm";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsAgent,
  setupHarness,
} from "../helpers/harness";


beforeAll(() => {
  setupHarness();
  registerConstants([...(kycTool.constants ?? []), ...(refundTool.constants ?? [])]);
  kycTool.seed?.();
  refundTool.seed?.();
});

function caseById(id: string): KycCase {
  const record = kycTool.get(id);
  if (!record) throw new Error(`no kyc case ${id}`);
  return record as KycCase;
}

function linked(id: string, actor: typeof admin): LinkedActivity {
  const activity = kycTool.linkedActivity?.(caseById(id), actor);
  if (!activity) throw new Error(`no linked activity on ${id}`);
  return activity;
}

describe("kyc linked activity", () => {
  it("joins refunds on the case email", () => {
    const record = caseById("kyc_0002");
    const expected = db
      .select({ id: refunds.id })
      .from(refunds)
      .where(eq(refunds.customerEmail, record.email))
      .all()
      .map((r) => r.id);
    expect(expected.length).toBeGreaterThan(0);

    const activity = linked("kyc_0002", admin);
    expect(activity.tool).toBe("refunds");
    expect(activity.summary.count).toBe(expected.length);
    expect(activity.rows.map((r) => r.id).sort()).toEqual([...expected].sort());
    expect(activity.summary.codes).toEqual(["faulty"]);
    expect(activity.summary.total).toMatch(/^\$[\d,]+\.\d{2}$/);
  });

  it("returns null when the customer has no refunds", () => {
    const orphan = kycTool
      .list({ filters: {}, limit: 200, offset: 0 })
      .rows.find(
        (row) =>
          db
            .select({ id: refunds.id })
            .from(refunds)
            .where(eq(refunds.customerEmail, String(row.email)))
            .all().length === 0,
      );
    if (!orphan) throw new Error("expected a case without refunds");
    expect(kycTool.linkedActivity?.(orphan, admin)).toBeNull();
  });

  it("gives non-admin KYC roles the aggregate and no PII", () => {
    for (const actor of [kycReviewer, kycManager]) {
      const activity = linked("kyc_0002", actor);
      expect(activity.summary.count).toBeGreaterThan(0);
      expect(activity.rows).toEqual([]);
      expect(activity.href).toBeNull();
      const json = JSON.stringify(activity);
      expect(json).not.toContain("tomas.reinholt@example.com");
      expect(json).not.toContain("9032");
      expect(json).not.toContain("Kestrel Outdoors");
    }
  });

  it("gives admin the rows and a link into the refunds tool", () => {
    const activity = linked("kyc_0002", admin);
    expect(activity.rows.length).toBe(activity.summary.count);
    expect(activity.href).toMatch(/^\/t\/refunds\?q=/);
    expect(activity.rowFields).toContain("customerEmail");
  });

  it("marks a refund held while it has a pending approval request", () => {
    expect(linked("kyc_0008", kycReviewer).summary.held).toBe(0);

    const result = executeIntent(refundsAgent, {
      tool: "refunds",
      action: "execute",
      recordId: "rfnd_0003",
      input: {},
      idempotencyKey: ulid(),
    });
    expect(result.outcome.status).toBe("pending_approval");

    const activity = linked("kyc_0008", admin);
    expect(activity.summary.held).toBe(1);
    expect(activity.heldIds).toEqual(["rfnd_0003"]);
    expect(linked("kyc_0008", kycReviewer).summary.held).toBe(1);
  });
});
