import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { registerConstants } from "@/engine/policy/register";
import type { Actor } from "@/engine/types";
import { kycTool } from "@/tools/kyc";
import { setupHarness } from "../helpers/harness";
import { analyst, manager } from "../helpers/harness";

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
    const result = act(analyst, "approve", "kyc_0001");
    expect(result.outcome.status).toBe("applied");
    expect(kycTool.get("kyc_0001")?.status).toBe("approved");
  });

  it("sends a high-risk case to a manager instead of applying it", () => {
    const result = act(analyst, "approve", "kyc_0003");
    expect(result.outcome.status).toBe("pending_approval");
    expect(kycTool.get("kyc_0003")?.status).toBe("pending_review");
  });

  it("escalates to an admin above the admin threshold", () => {
    const result = act(analyst, "approve", "kyc_0004");
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
    const result = act(manager, "approve", "kyc_0005");
    expect(result.outcome).toMatchObject({ status: "denied" });
    expect(kycTool.get("kyc_0005")?.status).toBe("escalated");
  });

  it("denies approval while documents are outstanding", () => {
    const result = act(analyst, "approve", "kyc_0006");
    expect(result.outcome).toMatchObject({ status: "denied" });
  });

  it("denies approval for a prohibited country", () => {
    const result = act(analyst, "approve", "kyc_0007");
    if (result.outcome.status !== "denied") throw new Error("expected a denial");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "country_permitted", type: "deny" }),
    );
  });

  it("rejects a case with a reason and records the decider", () => {
    const result = act(analyst, "reject", "kyc_0008", {
      reason: "Document tampering detected on upload",
    });
    expect(result.outcome.status).toBe("applied");
    const after = kycTool.get("kyc_0008");
    expect(after?.status).toBe("rejected");
    expect(after?.decidedBy).toBe(analyst.id);
    expect(after?.version).toBe(2);
  });

  it("refuses an action that the record's status does not offer", () => {
    const result = act(analyst, "approve", "kyc_0012");
    expect(result.outcome).toMatchObject({ code: "invalid_status" });
  });

  it("validates the input before anything else runs", () => {
    const result = act(analyst, "reject", "kyc_0002", { reason: "no" });
    expect(result.outcome).toMatchObject({ code: "invalid_input" });
    expect(kycTool.get("kyc_0002")?.status).toBe("pending_review");
  });

  it("requires a manager once a case has been escalated", () => {
    const result = act(analyst, "approve", "kyc_0011");
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "escalated_needs_manager" }),
    );
  });
});
