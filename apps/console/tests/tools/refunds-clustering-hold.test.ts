import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { CLUSTERING_WINDOW_DAYS_KEY, refundTool } from "@console/tool-refunds";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

const KESTREL_HELD = ["rfnd_0011", "rfnd_0012", "rfnd_0013"];

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
  refundTool.seed?.();
});

function act(
  actor: Actor,
  action: string,
  recordId: string,
  input: Record<string, unknown> = {},
) {
  return executeIntent(actor, {
    tool: "refunds",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

function executeDecision(recordId: string, actor: Actor = analyst) {
  const record = refundTool.get(recordId);
  if (!record) throw new Error(`missing ${recordId}`);
  return previewActions(refundTool, record, actor).find((p) => p.action === "execute")?.decision;
}

function setWindow(days: string) {
  expect(setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, days).ok).toBe(true);
}

function queue(name: "analyst" | "manager") {
  return refundTool.list({ filters: { queue: name }, limit: 1000, offset: 0 }).rows.map((r) => r.id);
}

describe("refunds clustering_hold", () => {
  it("reads allow with refunds.clustering_window_days at 0, the declared default", () => {
    const declared = refundTool.constants?.find((c) => c.key === CLUSTERING_WINDOW_DAYS_KEY);
    expect(declared?.value).toBe(0);
    for (const id of [...KESTREL_HELD, "rfnd_0014"]) {
      const decision = executeDecision(id);
      expect(decision?.effect).toBe("allow");
      expect(decision?.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    }
  });

  it("routes the refund that takes Kestrel's not_received total to the manager limit, and every later one, to a manager", () => {
    setWindow("14");
    for (const id of KESTREL_HELD) {
      const decision = executeDecision(id);
      expect(decision?.effect).toBe("require_approval");
      expect(decision?.trace).toContainEqual(
        expect.objectContaining({
          type: "require_approval",
          rule: "clustering_hold",
          tier: "manager",
          allowedRoles: ["manager"],
        }),
      );
      expect(decision?.trace).toContainEqual({ type: "allow", rule: "amount_approval" });
    }
  });

  it("names clustering_hold, the merchant and the running total in the trace", () => {
    const reasons = Object.fromEntries(
      KESTREL_HELD.map((id) => [
        id,
        executeDecision(id)?.trace.find((o) => o.rule === "clustering_hold"),
      ]),
    );
    expect(reasons.rfnd_0013).toMatchObject({
      reason: 'Kestrel Outdoors "not received" refunds reach $925 in 14 days, over the $500 manager limit',
    });
    expect(reasons.rfnd_0012).toMatchObject({
      reason: 'Kestrel Outdoors "not received" refunds reach $1,400 in 14 days, over the $500 manager limit',
    });
    expect(reasons.rfnd_0011).toMatchObject({
      reason: 'Kestrel Outdoors "not received" refunds reach $1,880 in 14 days, over the $500 manager limit',
    });
    expect(JSON.stringify(reasons)).not.toMatch(/@example\.com/);
  });

  it("leaves the refund before the total reaches the limit with the analyst", () => {
    const decision = executeDecision("rfnd_0014");
    expect(decision?.effect).toBe("allow");
    expect(decision?.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
  });

  it("moves held refunds out of the analyst queue into the manager queue", () => {
    const analystRows = queue("analyst");
    const managerRows = queue("manager");
    for (const id of KESTREL_HELD) {
      expect(analystRows).not.toContain(id);
      expect(managerRows).toContain(id);
    }
    expect(analystRows).toContain("rfnd_0014");
    expect(managerRows).not.toContain("rfnd_0014");
  });

  it("routes an analyst's rejection of a held refund to a manager too", () => {
    const reason =
      'Needs a manager: Kestrel Outdoors "not received" refunds reach $1,400 in 14 days, over the $500 manager limit';
    expect(act(analyst, "execute", "rfnd_0012").outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
      message: reason,
    });
    expect(
      act(analyst, "reject", "rfnd_0012", { reason: "Customer says it arrived." }).outcome,
    ).toMatchObject({ status: "error", code: "forbidden_role", message: reason });
    expect(refundTool.get("rfnd_0012")?.status).toBe("requested");
  });

  it("ignores refunds of other reason codes and merchants below the limit", () => {
    const others = refundTool
      .list({ filters: {}, limit: 1000, offset: 0 })
      .rows.filter((r) => r.merchant !== "Kestrel Outdoors" || r.reasonCode !== "not_received");
    expect(others.length).toBeGreaterThan(0);
    let checked = 0;
    for (const row of others) {
      const decision = executeDecision(row.id);
      if (!decision) continue;
      checked += 1;
      expect(decision.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("does not count rejected refunds or refunds outside the window", () => {
    setWindow("1");
    expect(executeDecision("rfnd_0011")?.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });

    setWindow("14");
    expect(act(analyst, "reject", "rfnd_0014", { reason: "Parcel was delivered." }).outcome.status).toBe(
      "applied",
    );
    expect(executeDecision("rfnd_0013")?.trace).toContainEqual({ type: "allow", rule: "clustering_hold" });
    expect(executeDecision("rfnd_0011")?.trace.find((o) => o.rule === "clustering_hold")).toMatchObject({
      type: "require_approval",
      reason: 'Kestrel Outdoors "not received" refunds reach $1,415 in 14 days, over the $500 manager limit',
    });
  });

  it("lets a manager send a held refund directly", () => {
    const record = refundTool.get("rfnd_0011");
    if (!record) throw new Error("missing rfnd_0011");
    expect(previewActions(refundTool, record, manager).find((p) => p.action === "execute")).toMatchObject({
      offered: true,
      actsAsApprover: true,
    });
    const result = act(manager, "execute", "rfnd_0011");
    expect(result.outcome.status).toBe("applied");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ type: "require_approval", rule: "clustering_hold", tier: "manager" }),
    );
    expect(refundTool.get("rfnd_0011")?.status).toBe("executing");
  });
});
