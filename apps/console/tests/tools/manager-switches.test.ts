import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { runtimeConstants } from "@console/db-core/engine-schema";
import { listAuditEvents } from "@console/engine/audit/query";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { ToolDeclaration } from "@console/engine/types";
import { REFUND_CLUSTERING_HOLD, SWITCH_SETTING_KEYS } from "@console/tool-automation";
import { MANAGER_APPROVAL_USD_KEY, refundTool } from "@console/tool-refunds";
import { admin, manager, setupHarness } from "../helpers/harness";

/** The refund hold's on/off switch, as its spec names it. */
const SWITCH = REFUND_CLUSTERING_HOLD.switchSetting ?? "refunds.clustering_hold";

/**
 * The refunds tool as it stands once the refund hold has merged: the hold
 * declares its switch, off by default. Declared here so these tests don't
 * depend on the hold being in the codebase.
 */
const refunds: ToolDeclaration = {
  ...refundTool,
  constants: [
    ...(refundTool.constants ?? []).filter((c) => c.key !== SWITCH),
    {
      key: SWITCH,
      value: false,
      type: "boolean",
      description: "Holds a merchant's not-received refunds for a manager once together they pass the manager limit.",
      tool: "refunds",
    },
  ],
};

function constantValue(key: string): unknown {
  const row = db.select().from(runtimeConstants).where(eq(runtimeConstants.key, key)).get();
  return row ? (JSON.parse(row.valueJson) as unknown) : undefined;
}

beforeAll(() => {
  setupHarness();
  registerConstants(refunds.constants ?? []);
});

describe("SWITCH_SETTING_KEYS", () => {
  it("names every rule's on/off switch and nothing else", () => {
    expect(SWITCH_SETTING_KEYS).toContain("refunds.clustering_hold");
    expect(SWITCH_SETTING_KEYS).toContain("kyc.merchant_monitoring");
    expect(SWITCH_SETTING_KEYS).not.toContain(MANAGER_APPROVAL_USD_KEY);
  });
});

describe("a manager changing settings", () => {
  it("may switch a rule on, audited under their name", () => {
    setConstant(admin, SWITCH, "false");
    const result = setConstant(manager, SWITCH, "true", { managerKeys: SWITCH_SETTING_KEYS });
    expect(result).toEqual({ ok: true, key: SWITCH, before: false, after: true });

    const row = listAuditEvents({ recordId: SWITCH, limit: 1 }).rows[0];
    expect(row?.action).toBe("set_constant");
    expect(row?.actorId).toBe(manager.id);

    setConstant(admin, SWITCH, "false");
  });

  it("may not touch a limit like the manager approval limit", () => {
    setConstant(admin, MANAGER_APPROVAL_USD_KEY, "500");
    const result = setConstant(manager, MANAGER_APPROVAL_USD_KEY, "777", {
      managerKeys: SWITCH_SETTING_KEYS,
    });
    expect(result).toEqual({ ok: false, reason: "Managers may only switch rules on and off" });
    expect(constantValue(MANAGER_APPROVAL_USD_KEY)).toBe(500);
  });
});
