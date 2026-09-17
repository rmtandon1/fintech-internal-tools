import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@/engine/execute-intent";
import { registerConstants } from "@/engine/policy/register";
import type { Actor } from "@/engine/types";
import { flagTool } from "@/tools/flags";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  registerConstants(flagTool.constants ?? []);
  flagTool.seed?.();
});

function act(
  actor: Actor,
  action: string,
  recordId: string,
  input: Record<string, unknown> = {},
) {
  return executeIntent(actor, {
    tool: "flags",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

/** flag_0002 kill switch, flag_0006 permission, flag_0010 past review date. */
describe("feature flags", () => {
  it("lets anyone pull a kill switch without an approval", () => {
    const enabled = act(analyst, "set_rollout", "flag_0002", {
      percent: 25,
      reason: "Primary acquirer degraded",
    });
    expect(enabled.outcome.status).toBe("applied");
    const off = act(analyst, "disable", "flag_0002", {
      reason: "Primary acquirer recovered",
    });
    expect(off.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0002")?.rolloutPercent).toBe(0);
  });

  it("requires a manager to enable a customer-facing production flag", () => {
    const result = act(analyst, "enable", "flag_0001", {
      reason: "Ramp instant payouts to everyone",
    });
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "production_enable", tier: "manager" }),
    );
    expect(flagTool.get("flag_0001")?.rolloutPercent).toBe(25);
  });

  it("requires an admin for a permission flag", () => {
    const result = act(manager, "enable", "flag_0006", {
      reason: "Re-enable the low-risk bypass",
    });
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "permission_flag_tier",
        tier: "admin",
        allowedRoles: ["admin"],
      }),
    );
  });

  it("allows a rollout step inside the limit and holds a larger one", () => {
    const small = act(analyst, "set_rollout", "flag_0009", {
      percent: 30,
      reason: "Next ledger cohort",
    });
    expect(small.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0009")?.status).toBe("partial");

    const large = act(analyst, "set_rollout", "flag_0009", {
      percent: 100,
      reason: "Straight to everyone",
    });
    if (large.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(large.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "rollout_increase", tier: "manager" }),
    );
  });

  it("treats a decrease as ordinary regardless of size", () => {
    const result = act(analyst, "set_rollout", "flag_0005", {
      percent: 0,
      reason: "Shadow scoring skewing the queue",
    });
    expect(result.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0005")?.status).toBe("off");
  });

  it("routes a flag past its review date to a manager", () => {
    const result = act(analyst, "set_rollout", "flag_0010", {
      percent: 90,
      reason: "Keep legacy reconciliation running",
    });
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "not_expired" }),
    );
  });

  it("keeps archiving with managers and admins", () => {
    expect(act(analyst, "archive", "flag_0007", { reason: "Code path removed" }).outcome)
      .toMatchObject({ code: "forbidden_role" });
    const archived = act(admin, "archive", "flag_0007", {
      reason: "Bulk refunds shipped without a flag",
    });
    expect(archived.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0007")?.status).toBe("archived");
  });

  it("refuses to change an archived flag", () => {
    const result = act(manager, "set_rollout", "flag_0007", {
      percent: 50,
      reason: "Bring it back",
    });
    expect(result.outcome).toMatchObject({ code: "invalid_status" });
  });

  it("rejects a rollout outside 0-100 and an empty reason", () => {
    expect(
      act(manager, "set_rollout", "flag_0003", { percent: 140, reason: "Too far" })
        .outcome,
    ).toMatchObject({ code: "invalid_input" });
    expect(
      act(manager, "set_rollout", "flag_0003", { percent: 50, reason: "no" }).outcome,
    ).toMatchObject({ code: "invalid_input" });
  });

  it("records the actor and bumps the version on every change", () => {
    const before = flagTool.get("flag_0011");
    const result = act(manager, "disable", "flag_0011", {
      reason: "SMS provider outage",
    });
    expect(result.outcome.status).toBe("applied");
    const after = flagTool.get("flag_0011");
    expect(after?.lastChangedBy).toBe(manager.id);
    expect(after?.version).toBe((before?.version ?? 0) + 1);
  });
});
