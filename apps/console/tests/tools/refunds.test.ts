import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { approvalRequests, auditLog } from "@console/db-core/engine-schema";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import type { Actor, GovernedRecord, Rule } from "@console/engine/types";
import { refundTool } from "@console/tool-refunds";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";
import { expectRecordStatsMatchList } from "../helpers/stats";
import { resolveStat } from "@/lib/stats";
import { resolveQueueFilters } from "@/lib/tool-queue-filters";

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

function approvalRows(recordId: string, action: string) {
  return db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.tool, "refunds"),
        eq(approvalRequests.recordId, recordId),
        eq(approvalRequests.action, action),
      ),
    )
    .all();
}

describe("refund queues", () => {
  it("routes over-limit refunds out of the analyst queue and into the manager queue", () => {
    const list = (queue: "analyst" | "manager") =>
      refundTool.list({ filters: { queue }, limit: 1000, offset: 0 }).rows.map((row) => row.id);
    const analystRows = list("analyst");
    const managerRows = list("manager");

    expect(analystRows).not.toContain("rfnd_0003");
    expect(analystRows).not.toContain("rfnd_0004");
    expect(managerRows).toContain("rfnd_0003");
    expect(managerRows).toContain("rfnd_0004");
    expect(refundTool.defaultFilters?.(analyst)).toEqual({ queue: "analyst" });
    expect(refundTool.defaultFilters?.(manager)).toEqual({ queue: "manager" });
    expect(refundTool.defaultFilters?.(admin)).toEqual({});
  });

  it("uses the execute declaration's live rules to determine queue placement", () => {
    const execute = refundTool.actions.find((action) => action.name === "execute");
    if (!execute) throw new Error("refunds.execute is not declared");
    const dynamicRoute: Rule<GovernedRecord, unknown> = () => ({
      type: "require_approval",
      rule: "runtime_route",
      tier: "manager",
      allowedRoles: ["manager"],
      reason: "Runtime routing rule",
    });

    execute.rules.push(dynamicRoute);
    try {
      const analystRows = refundTool.list({
        filters: { queue: "analyst" },
        limit: 1000,
        offset: 0,
      }).rows;
      const managerRows = refundTool.list({
        filters: { queue: "manager" },
        limit: 1000,
        offset: 0,
      }).rows;
      expect(analystRows.map((row) => row.id)).not.toContain("rfnd_0001");
      expect(managerRows.map((row) => row.id)).toContain("rfnd_0001");
    } finally {
      execute.rules.pop();
    }
  });
});

describe("refund actions", () => {
  it("lets an analyst pay a small refund straight through", () => {
    const result = act(analyst, "execute", "rfnd_0001");
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0001")?.status).toBe("executing");
  });

  it("refuses analyst payment and rejection of a routed refund", () => {
    const execute = act(analyst, "execute", "rfnd_0003");
    expect(execute.outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
      message: "Needs a manager: Amount exceeds manager threshold",
    });

    const rejected = act(analyst, "reject", "rfnd_0003", { reason: "Not eligible for payment" });
    expect(rejected.outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
      message: "Needs a manager: Amount exceeds manager threshold",
    });
    expect(refundTool.get("rfnd_0003")?.status).toBe("requested");
  });

  it("lets the manager pay a routed refund directly without an approval request", () => {
    const before = approvalRows("rfnd_0004", "execute");
    const result = act(manager, "execute", "rfnd_0004");

    expect(result.outcome.status).toBe("applied");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ type: "require_approval", rule: "amount_approval", tier: "manager" }),
    );
    expect(refundTool.get("rfnd_0004")?.status).toBe("executing");
    expect(approvalRows("rfnd_0004", "execute")).toEqual(before);
    expect(
      db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tool, "refunds"),
            eq(auditLog.recordId, "rfnd_0004"),
            eq(auditLog.action, "execute"),
            eq(auditLog.event, "applied"),
          ),
        )
        .all(),
    ).toHaveLength(1);
  });

  it("lets analysts reject denied non-routed refunds and managers reject routed refunds directly", () => {
    expect(act(analyst, "execute", "rfnd_0007").outcome.status).toBe("denied");
    expect(
      act(analyst, "reject", "rfnd_0007", { reason: "Open chargeback prevents a refund" }).outcome
        .status,
    ).toBe("applied");

    const before = approvalRows("rfnd_0003", "reject");
    const result = act(manager, "reject", "rfnd_0003", { reason: "Merchant duplicate confirmed" });
    expect(result.outcome.status).toBe("applied");
    expect(refundTool.get("rfnd_0003")?.status).toBe("rejected");
    expect(approvalRows("rfnd_0003", "reject")).toEqual(before);
    for (const queue of ["analyst", "manager"] as const) {
      expect(
        refundTool
          .list({ filters: { queue }, limit: 1000, offset: 0 })
          .rows.map((row) => row.id),
      ).not.toContain("rfnd_0003");
    }
  });

  it("denies a refund that would exceed the captured amount", () => {
    const result = act(manager, "execute", "rfnd_0006");
    if (result.outcome.status !== "denied") throw new Error("expected a denial");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "within_captured_amount", type: "deny" }),
    );
    expect(refundTool.get("rfnd_0006")?.status).toBe("requested");
  });

  it("counts the money as refunded only on settlement", () => {
    const before = refundTool.get("rfnd_0008");
    expect(before?.refundedMinor).toBe(0);
    const result = act(manager, "mark_settled", "rfnd_0008", { reference: "re_77120" });
    expect(result.outcome.status).toBe("applied");
    const after = refundTool.get("rfnd_0008");
    expect(after?.status).toBe("settled");
    expect(after?.refundedMinor).toBe(before?.amountMinor);
    expect(after?.settledAt).toBeGreaterThan(0);
  });

  it("keeps settlement out of an analyst's hands", () => {
    const result = act(analyst, "mark_settled", "rfnd_0008", { reference: "re_00001" });
    expect(result.outcome).toMatchObject({ code: "forbidden_role" });
  });

  it("lets a failed refund be retried but not a settled one", () => {
    expect(act(analyst, "execute", "rfnd_0009").outcome.status).toBe("applied");
    expect(act(analyst, "execute", "rfnd_0010").outcome).toMatchObject({
      code: "invalid_status",
    });
  });
});

describe("refund stats", () => {
  it("declares three stats for each role that can open the queue", () => {
    for (const role of refundTool.visibleTo) {
      expect(refundTool.stats?.filter((s) => s.roles.includes(role)).length, role).toBe(3);
    }
  });

  it("counts each records stat with the same query its link opens", () => {
    expectRecordStatsMatchList(refundTool);
    for (const actor of [analyst, manager, admin]) {
      for (const stat of refundTool.stats ?? []) {
        if (!stat.roles.includes(actor.role) || stat.source.kind !== "records") continue;
        const { value, href } = resolveStat(refundTool, actor, stat);
        const query = Object.fromEntries(
          new URL(href, "http://x").searchParams.entries(),
        );
        const { filters } = resolveQueueFilters(refundTool, actor, query);
        expect(
          refundTool.list({ filters, limit: 0, offset: 0 }).total,
          `${actor.role} ${stat.key}`,
        ).toBe(value);
      }
    }
  });
});
