import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { executeIntent } from "@console/engine/execute-intent";
import { loadConstants } from "@console/engine/policy/constants";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor, GovernedRecord, ToolDeclaration } from "@console/engine/types";
import { kycTool } from "@console/tool-kyc";
import { kycCases } from "@console/tool-kyc/schema";
import {
  CLUSTERING_HOLD_KEY,
  CLUSTERING_WINDOW_DAYS_KEY,
  MANAGER_APPROVAL_USD_KEY,
  refundTool,
} from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, analyst, setupHarness } from "../helpers/harness";

const DAY = 24 * 60 * 60 * 1000;
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];

function switchHold(on: boolean): void {
  expect(setConstant(admin, CLUSTERING_HOLD_KEY, on ? "true" : "false").ok).toBe(true);
}

function preview(decl: ToolDeclaration, record: GovernedRecord, action: string) {
  const found = previewActions(decl, record, analyst).find((p) => p.action === action);
  if (!found?.decision) throw new Error(`no ${action} decision`);
  return found.decision;
}

function refund(id: string) {
  const record = refundTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  return record;
}

function holdOutcome(id: string) {
  return preview(refundTool, refund(id), "execute").trace.find((o) => o.rule === "clustering_hold");
}

function queueIds(queue: "analyst" | "manager"): string[] {
  return refundTool.list({ filters: { queue }, limit: 1000, offset: 0 }).rows.map((r) => r.id);
}

function insertRefund(id: string, merchant: string, reasonCode: string, usdMinor: number): void {
  db.insert(refunds)
    .values({
      id,
      paymentId: `pay_${id}`,
      customerEmail: `${id}@example.com`,
      cardLast4: "0001",
      merchant,
      psp: "stripe",
      currency: "USD",
      capturedMinor: usdMinor,
      refundedMinor: 0,
      amountMinor: usdMinor,
      usdMinor,
      reasonCode,
      disputed: 0,
      status: "requested",
      requestedBy: null,
      requestedAt: Date.now() - DAY / 2,
      settledAt: null,
      lastNote: null,
      version: 1,
    })
    .run();
}

function insertCase(id: string, email: string, riskScore: number): void {
  const now = Date.now();
  db.insert(kycCases)
    .values({
      id,
      customerName: `Customer ${id}`,
      email,
      dateOfBirth: "1990-01-01",
      documentType: "passport",
      documentNumber: `DOC${id}`,
      country: "GB",
      segment: "consumer",
      riskScore,
      riskTier: riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low",
      sanctionsHit: 0,
      pep: 0,
      documentsComplete: 1,
      status: "pending_review",
      openedAt: now - DAY,
      dueAt: now + DAY,
      lastNote: null,
      decidedBy: null,
      version: 1,
    })
    .run();
}

function kycCase(id: string) {
  const record = kycTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  return record;
}

function act(actor: Actor, tool: string, action: string, recordId: string) {
  return executeIntent(actor, { tool, action, recordId, input: {}, idempotencyKey: ulid() });
}

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  refundTool.seed?.();
  kycTool.seed?.();
});

beforeEach(() => switchHold(false));

describe("refund hold switch", () => {
  it("is declared on the refunds tool as a boolean that is off by default", () => {
    const decl = refundTool.constants?.find((c) => c.key === CLUSTERING_HOLD_KEY);
    expect(decl).toMatchObject({ key: "refunds.clustering_hold", type: "boolean", value: false, tool: "refunds" });
    expect(refundTool.actions.find((a) => a.name === "execute")?.rules).toHaveLength(5);
  });

  it("while off, clustering_hold reads allow and the Kestrel refunds stay with the analyst", () => {
    expect(loadConstants().boolean(CLUSTERING_HOLD_KEY, true)).toBe(false);
    for (const id of KESTREL) {
      expect(holdOutcome(id)).toEqual({ type: "allow", rule: "clustering_hold" });
      expect(preview(refundTool, refund(id), "execute").effect).toBe("allow");
    }
    expect(queueIds("analyst")).toEqual(expect.arrayContaining(KESTREL));
  });

  it("while on with a clustering window of 0, nothing is held", () => {
    registerConstants([
      { key: CLUSTERING_WINDOW_DAYS_KEY, value: 14, type: "number", description: "Days of refunds a cluster looks back over", tool: "refunds" },
    ]);
    switchHold(true);
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0").ok).toBe(true);
    for (const id of KESTREL) expect(holdOutcome(id)).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "14").ok).toBe(true);
  });
});

describe("clustering_hold with the switch on", () => {
  it("sends every pending Kestrel refund, the first included, to the manager's queue and names the merchant and total", () => {
    switchHold(true);
    for (const id of KESTREL) {
      expect(holdOutcome(id)).toMatchObject({
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: ["manager"],
        reason: "Possible fraud: 4 refunds from Kestrel Outdoors add up to $1,880, past the $500 manager limit",
      });
    }
    const manager = queueIds("manager");
    expect(manager).toEqual(expect.arrayContaining(KESTREL));
    for (const id of KESTREL) expect(queueIds("analyst")).not.toContain(id);

    expect(act(analyst, "refunds", "execute", "rfnd_0011").outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
    });
    expect(refund("rfnd_0011").status).toBe("requested");
  });

  it("holds a later not_received refund from the same merchant in the window", () => {
    insertRefund("rfnd_hold_later", "Kestrel Outdoors", "not_received", 1_000);
    switchHold(true);
    expect(holdOutcome("rfnd_hold_later")).toMatchObject({ type: "require_approval", rule: "clustering_hold" });
    expect(queueIds("manager")).toContain("rfnd_hold_later");
    db.delete(refunds).where(eq(refunds.id, "rfnd_hold_later")).run();
  });

  it("lets a merchant whose not_received refunds stay under the limit together go through", () => {
    insertRefund("rfnd_hold_small_a", "Small Shop", "not_received", 10_000);
    insertRefund("rfnd_hold_small_b", "Small Shop", "not_received", 12_000);
    switchHold(true);
    for (const id of ["rfnd_hold_small_a", "rfnd_hold_small_b"]) {
      expect(holdOutcome(id)).toEqual({ type: "allow", rule: "clustering_hold" });
      expect(preview(refundTool, refund(id), "execute").effect).toBe("allow");
      expect(queueIds("analyst")).toContain(id);
    }
  });

  it("does not hold a faulty refund from a clustered merchant", () => {
    insertRefund("rfnd_hold_faulty", "Kestrel Outdoors", "faulty", 10_000);
    switchHold(true);
    expect(holdOutcome("rfnd_hold_faulty")).toEqual({ type: "allow", rule: "clustering_hold" });
    expect(preview(refundTool, refund("rfnd_hold_faulty"), "execute").effect).toBe("allow");
  });

  it("does not count rejected refunds, so a cluster that falls under the limit is released", () => {
    expect(setConstant(admin, MANAGER_APPROVAL_USD_KEY, "150000").ok).toBe(true);
    switchHold(true);
    expect(holdOutcome("rfnd_0011")).toMatchObject({ type: "require_approval", rule: "clustering_hold" });

    db.update(refunds).set({ status: "rejected" }).where(eq(refunds.id, "rfnd_0014")).run();
    for (const id of ["rfnd_0011", "rfnd_0012", "rfnd_0013"]) {
      expect(holdOutcome(id)).toEqual({ type: "allow", rule: "clustering_hold" });
      expect(queueIds("analyst")).toContain(id);
    }

    db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, "rfnd_0014")).run();
    expect(setConstant(admin, MANAGER_APPROVAL_USD_KEY, "50000").ok).toBe(true);
  });
});

describe("linked_refund_hold on KYC approval", () => {
  it("sends a low-risk case whose customer has a held refund to a manager", () => {
    insertCase("kyc_hold_linked", refund("rfnd_0011").customerEmail, 20);
    expect(preview(kycTool, kycCase("kyc_hold_linked"), "approve").trace).toContainEqual({
      type: "allow",
      rule: "linked_refund_hold",
    });

    switchHold(true);
    const result = act(analyst, "kyc", "approve", "kyc_hold_linked");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        type: "require_approval",
        rule: "linked_refund_hold",
        tier: "manager",
        allowedRoles: ["manager"],
      }),
    );
    expect(kycCase("kyc_hold_linked").status).toBe("pending_review");
  });

  it("leaves a case with no held refunds unchanged: score 68 still clears", () => {
    insertCase("kyc_hold_clear", "no-refunds@example.com", 68);
    switchHold(true);
    const result = act(analyst, "kyc", "approve", "kyc_hold_clear");
    expect(result.outcome.status).toBe("applied");
    expect(kycCase("kyc_hold_clear").status).toBe("approved");
  });
});
