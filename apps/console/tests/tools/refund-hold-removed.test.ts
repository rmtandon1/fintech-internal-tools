import { beforeAll, describe, expect, it } from "vitest";
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
import { refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { admin, analyst, setupHarness } from "../helpers/harness";

const DAY = 24 * 60 * 60 * 1000;
const KESTREL = ["rfnd_0011", "rfnd_0012", "rfnd_0013", "rfnd_0014"];
const SWITCH = "refunds.clustering_hold";

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

function kycCase(id: string) {
  const record = kycTool.get(id);
  if (!record) throw new Error(`missing ${id}`);
  return record;
}

function queueIds(queue: "analyst" | "manager"): string[] {
  return refundTool.list({ filters: { queue }, limit: 1000, offset: 0 }).rows.map((r) => r.id);
}

function refundStatus(id: string): string | undefined {
  return db.select({ status: refunds.status }).from(refunds).where(eq(refunds.id, id)).get()?.status;
}

function customerEmailOf(id: string): string {
  const row = db.select({ email: refunds.customerEmail }).from(refunds).where(eq(refunds.id, id)).get();
  if (!row) throw new Error(`missing ${id}`);
  return row.email;
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

function act(actor: Actor, tool: string, action: string, recordId: string) {
  return executeIntent(actor, { tool, action, recordId, input: {}, idempotencyKey: ulid() });
}

beforeAll(() => {
  setupHarness();
  registerConstants([...(refundTool.constants ?? []), ...(kycTool.constants ?? [])]);
  // A stored switch row that no tool declares any more.
  registerConstants([
    { key: SWITCH, value: false, type: "boolean", description: "Leftover refund hold switch.", tool: "refunds" },
  ]);
  expect(setConstant(admin, SWITCH, "true").ok).toBe(true);
  refundTool.seed?.();
  kycTool.seed?.();
});

describe("refund hold removed", () => {
  it("the refunds tool no longer declares the refund hold switch and execute runs its four earlier rules", () => {
    expect(refundTool.constants?.map((c) => c.key)).not.toContain(SWITCH);
    expect(refundTool.actions.find((a) => a.name === "execute")?.rules).toHaveLength(4);
    const rules = preview(refundTool, refund("rfnd_0011"), "execute").trace.map((o) => o.rule);
    expect(rules).toEqual(["within_captured_amount", "not_disputed", "amount_approval", "goodwill_approval"]);
  });

  it("a leftover stored switch set to true holds no Kestrel refund: they stay with the analyst", () => {
    expect(loadConstants().boolean(SWITCH, false)).toBe(true);
    for (const id of KESTREL) {
      expect(preview(refundTool, refund(id), "execute").effect).toBe("allow");
    }
    const analystQueue = queueIds("analyst");
    const managerQueue = queueIds("manager");
    for (const id of KESTREL) {
      expect(analystQueue).toContain(id);
      expect(managerQueue).not.toContain(id);
    }
  });

  it("an analyst sends a Kestrel not_received refund straight to the processor", () => {
    const result = act(analyst, "refunds", "execute", "rfnd_0012");
    expect(result.outcome.status).toBe("applied");
    expect(refundStatus("rfnd_0012")).not.toBe("requested");
  });

  it("KYC approve no longer runs linked_refund_hold, so a low-risk case linked to a Kestrel refund clears", () => {
    insertCase("kyc_hold_removed", customerEmailOf("rfnd_0011"), 20);
    const result = act(analyst, "kyc", "approve", "kyc_hold_removed");
    if (!("trace" in result.outcome) || !result.outcome.trace) throw new Error("outcome has no trace");
    expect(result.outcome.trace.map((o) => o.rule)).not.toContain("linked_refund_hold");
    expect(result.outcome.status).toBe("applied");
    expect(kycCase("kyc_hold_removed").status).toBe("approved");
  });
});
