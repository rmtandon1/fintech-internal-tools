import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { registerConstants } from "@/engine/policy/register";
import type { Actor } from "@/engine/types";
import { kycTool } from "@/tools/kyc";
import { setupHarness } from "../helpers/harness";
import { getApproval, canDecide } from "@/engine/approvals";
import { admin, kycManager, kycReviewer, refundsAgent, refundsManager } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  registerConstants(kycTool.constants ?? []);
  kycTool.seed?.();
});

function act(
  actor: Actor,
  action: string,
  recordId: string,
  input: Record<string, unknown> = {},
) {
  return executeIntent(actor, {
    tool: "kyc",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

describe("kyc review queue", () => {
  it("approves a low-risk case straight through", () => {
    const result = act(kycReviewer, "approve", "kyc_0001");
    expect(result.outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0001")?.status).toBe("approved");
  });

  it("sends a high-risk case to a manager instead of applying it", () => {
    const result = act(kycReviewer, "approve", "kyc_0003");
    expect(result.outcome.status).toBe("pending_approval");
    expect(kycTool.get("kyc_0003")?.status).toBe("pending_review");
  });

  it("escalates to an admin above the admin threshold", () => {
    const result = act(kycReviewer, "approve", "kyc_0004");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "risk_tier_approval",
        tier: "admin",
        allowedRoles: ["admin"],
      }),
    );
  });

  it("denies approval while a sanctions hit is open", () => {
    const result = act(kycManager, "approve", "kyc_0005");
    expect(result.outcome).toMatchObject({ status: "denied" });
    expect(kycTool.get("kyc_0005")?.status).toBe("escalated");
  });

  it("denies approval while documents are outstanding", () => {
    const result = act(kycReviewer, "approve", "kyc_0006");
    expect(result.outcome).toMatchObject({ status: "denied" });
  });

  it("denies approval for a prohibited country", () => {
    const result = act(kycReviewer, "approve", "kyc_0007");
    if (result.outcome.status !== "denied") throw new Error("expected a denial");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "country_permitted", type: "deny" }),
    );
  });

  it("rejects a case with a reason and records the decider", () => {
    const result = act(kycReviewer, "reject", "kyc_0008", {
      reason: "Document tampering detected on upload",
    });
    expect(result.outcome.status).toBe("applied");
    const after = kycTool.get("kyc_0008");
    expect(after?.status).toBe("rejected");
    expect(after?.decidedBy).toBe(kycReviewer.id);
    expect(after?.version).toBe(2);
  });

  it("refuses an action that the record's status does not offer", () => {
    const result = act(kycReviewer, "approve", "kyc_0012");
    expect(result.outcome).toMatchObject({ code: "invalid_status" });
  });

  it("validates the input before anything else runs", () => {
    const result = act(kycReviewer, "reject", "kyc_0002", { reason: "no" });
    expect(result.outcome).toMatchObject({ code: "invalid_input" });
    expect(kycTool.get("kyc_0002")?.status).toBe("pending_review");
  });

  it("seeds a queue deep enough to page through, with high-risk work waiting", () => {
    const { rows, total } = kycTool.list({ filters: {}, limit: 50, offset: 0 });
    expect(total).toBeGreaterThanOrEqual(100);
    expect(rows).toHaveLength(50);
    const pendingHighRisk = kycTool
      .list({ filters: { status: "pending_review" }, limit: 200, offset: 0 })
      .rows.filter((row) => Number(row.riskScore) >= 70);
    expect(pendingHighRisk.length).toBeGreaterThanOrEqual(3);
  });

  it("never seeds an approved case that the approval rules would deny", () => {
    const approved = kycTool
      .list({ filters: { status: "approved" }, limit: 200, offset: 0 })
      .rows.filter((row) => row.documentsComplete === 0 || row.sanctionsHit === 1);
    expect(approved).toEqual([]);
  });

  it("sorts on a declared column in both directions", () => {
    const query = (direction: "asc" | "desc") =>
      kycTool
        .list({ filters: {}, sort: { field: "riskScore", direction }, limit: 10, offset: 0 })
        .rows.map((row) => Number(row.riskScore));

    const ascending = query("asc");
    const descending = query("desc");
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    expect(ascending[0]).toBeLessThan(descending[0]);
  });

  it("ignores a sort field the declaration does not offer", () => {
    const rows = kycTool.list({
      filters: {},
      sort: { field: "documentNumber", direction: "asc" },
      limit: 5,
      offset: 0,
    }).rows;
    const scores = rows.map((row) => Number(row.riskScore));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("requires a manager once a case has been escalated", () => {
    const result = act(kycReviewer, "approve", "kyc_0011");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "escalated_needs_manager" }),
    );
  });
});
