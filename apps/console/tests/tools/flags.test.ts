import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor } from "@console/engine/types";
import { flagTool } from "@console/tool-flags";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsManager,
  setupHarness,
} from "../helpers/harness";
import { expectRecordStatsMatchList } from "../helpers/stats";

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
  it("keeps domain agents and reviewers out of flag changes", () => {
    expect(
      act(kycReviewer, "enable", "flag_0009", { reason: "Not my domain" }).outcome,
    ).toMatchObject({ code: "forbidden_role" });
  });

  it("lets a refunds manager enable a non-production flag", () => {
    const result = act(refundsManager, "enable", "flag_0009", {
      reason: "Cross-domain flag ownership",
    });
    expect(result.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0009")?.status).toBe("on");
  });

  it("lets any manager pull a kill switch without an approval", () => {
    const enabled = act(kycManager, "set_rollout", "flag_0002", {
      percent: 25,
      reason: "Primary acquirer degraded",
    });
    expect(enabled.outcome.status).toBe("applied");
    const off = act(kycManager, "disable", "flag_0002", {
      reason: "Primary acquirer recovered",
    });
    expect(off.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0002")?.rolloutPercent).toBe(0);
  });

  it("requires a manager to enable a customer-facing production flag", () => {
    const result = act(kycManager, "enable", "flag_0001", {
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
    const result = act(kycManager, "enable", "flag_0006", {
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
    const small = act(kycManager, "set_rollout", "flag_0009", {
      percent: 30,
      reason: "Next ledger cohort",
    });
    expect(small.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0009")?.status).toBe("partial");

    const large = act(kycManager, "set_rollout", "flag_0009", {
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

  it("holds a small rollout that raises customer-facing production traffic", () => {
    const result = act(kycManager, "set_rollout", "flag_0012", {
      percent: 25,
      reason: "Start the digest cohort",
    });
    if (result.outcome.status !== "pending_approval") {
      throw new Error("expected an approval request");
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "production_exposure_increase", tier: "manager" }),
    );
    expect(flagTool.get("flag_0012")?.rolloutPercent).toBe(0);
  });

  it("leaves a customer-facing production decrease ungated", () => {
    const result = act(kycManager, "set_rollout", "flag_0001", {
      percent: 10,
      reason: "Funding balance under pressure",
    });
    expect(result.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0001")?.rolloutPercent).toBe(10);
  });

  it("treats a decrease as ordinary regardless of size", () => {
    const result = act(kycManager, "set_rollout", "flag_0005", {
      percent: 0,
      reason: "Shadow scoring skewing the queue",
    });
    expect(result.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0005")?.status).toBe("off");
  });

  it("routes a flag past its review date to a manager", () => {
    const result = act(kycManager, "set_rollout", "flag_0010", {
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
    expect(act(kycReviewer, "archive", "flag_0007", { reason: "Code path removed" }).outcome)
      .toMatchObject({ code: "forbidden_role" });
    const archived = act(admin, "archive", "flag_0007", {
      reason: "Bulk refunds shipped without a flag",
    });
    expect(archived.outcome.status).toBe("applied");
    expect(flagTool.get("flag_0007")?.status).toBe("archived");
  });

  it("refuses to change an archived flag", () => {
    const result = act(kycManager, "set_rollout", "flag_0007", {
      percent: 50,
      reason: "Bring it back",
    });
    expect(result.outcome).toMatchObject({ code: "invalid_status" });
  });

  it("rejects a rollout outside 0-100 and an empty reason", () => {
    expect(
      act(kycManager, "set_rollout", "flag_0003", { percent: 140, reason: "Too far" })
        .outcome,
    ).toMatchObject({ code: "invalid_input" });
    expect(
      act(kycManager, "set_rollout", "flag_0003", { percent: 50, reason: "no" }).outcome,
    ).toMatchObject({ code: "invalid_input" });
  });

  it("records the actor and bumps the version on every change", () => {
    const before = flagTool.get("flag_0011");
    const result = act(kycManager, "disable", "flag_0011", {
      reason: "SMS provider outage",
    });
    expect(result.outcome.status).toBe("applied");
    const after = flagTool.get("flag_0011");
    expect(after?.lastChangedBy).toBe(kycManager.id);
    expect(after?.version).toBe((before?.version ?? 0) + 1);
  });
});

describe("flags stats", () => {
  it("declares three stats for each role that can open the queue", () => {
    for (const role of flagTool.visibleTo) {
      expect(flagTool.stats?.filter((s) => s.roles.includes(role)).length, role).toBe(3);
    }
  });

  it("counts each records stat with the same query its link opens", () => {
    expectRecordStatsMatchList(flagTool);
  });

  it("lists only flags past their review date that still serve traffic", () => {
    const now = Date.now();
    const expired = flagTool.list({ filters: { expired: "yes" }, limit: 1000, offset: 0 });
    expect(expired.total).toBeGreaterThan(0);
    for (const row of expired.rows) {
      expect(Number(row.expiresAt)).toBeLessThan(now);
      expect(["on", "partial"]).toContain(row.status);
    }
  });
});

describe("feature flag switches", () => {
  const toggle = flagTool.toggle;
  if (!toggle) throw new Error("flags declares no switches");

  it("declares switch actions that exist on the tool", () => {
    const names = flagTool.actions.map((a) => a.name);
    expect(names).toContain(toggle.on);
    expect(names).toContain(toggle.off);
    expect(flagTool.fields.map((f) => f.name)).toContain(toggle.groupBy);
  });

  it("offers the flipping action for every live flag, and none for archived ones", () => {
    const { rows } = flagTool.list({ filters: {}, limit: 500, offset: 0 });
    for (const row of rows) {
      const action = row[toggle.field] ? toggle.off : toggle.on;
      const preview = previewActions(flagTool, row, kycManager).find((p) => p.action === action);
      expect(preview?.offered, `${row.key} (${row.status})`).toBe(row.status !== "archived");
    }
  });

  it("turns a flag off through the write path when its switch is flipped", () => {
    const { rows } = flagTool.list({ filters: { status: "on" }, limit: 1, offset: 0 });
    const flag = rows[0];
    const result = act(kycManager, toggle.off, flag.id, { reason: "Switch flipped off in test" });
    expect(result.outcome.status).toBe("applied");
    expect(flagTool.get(flag.id)?.[toggle.field]).toBe(0);
  });
});
