import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { approve, canDecide, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { ROLES } from "@console/permissions";
import {
  DISPUTES,
  EXPORT_AT,
  FIGHT_APPROVAL_USD_KEY,
  FRAUD_ACCEPT_APPROVAL_USD_KEY,
  chargebackTool,
  seedDisputes,
} from "@console/tool-chargebacks";
import { getTool } from "@/registry";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsAgent,
  refundsManager,
  setupHarness,
} from "../helpers/harness";
import { expectRecordStatsMatchList } from "../helpers/stats";

const CSV = resolve(__dirname, "../../../../fixtures/power-apps/chargebacks/Data/disputes.csv");
const HOUR = 60 * 60 * 1000;

function exportRows(): Record<string, string>[] {
  const [header, ...lines] = readFileSync(CSV, "utf8").trim().split("\n");
  const keys = header.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  });
}

const code = (choice: string) => choice.toLowerCase().replaceAll(" ", "_");

function act(actor: Actor, action: string, recordId: string, note = "Reviewed the case file.") {
  return executeIntent(actor, {
    tool: "chargebacks",
    action,
    recordId,
    input: { note },
    idempotencyKey: ulid(),
  });
}

function dueSoon() {
  return chargebackTool.list({ filters: { due: "over_1000_48h" }, limit: 100, offset: 0 });
}

beforeAll(() => {
  setupHarness();
  registerConstants(chargebackTool.constants ?? []);
  chargebackTool.seed?.();
});

describe("chargebacks seed", () => {
  it("seeds the 50 disputes from disputes.csv, field for field", () => {
    seedDisputes(EXPORT_AT);
    const rows = exportRows();
    expect(rows).toHaveLength(50);
    expect(DISPUTES).toHaveLength(50);
    expect(chargebackTool.list({ filters: {}, limit: 100, offset: 0 }).total).toBe(50);
    for (const row of rows) {
      expect(chargebackTool.get(row.DisputeId), row.DisputeId).toEqual({
        id: row.DisputeId,
        cardNetwork: code(row.CardNetwork),
        reasonCode: row.ReasonCode,
        reasonCategory: code(row.ReasonCategory),
        merchant: row.Merchant,
        amountUsdMinor: Math.round(Number(row.AmountUSD) * 100),
        openedAt: Date.parse(row.OpenedOn),
        dueAt: Date.parse(row.DueDate),
        status: code(row.Status),
        evidenceUploaded: row.EvidenceUploaded === "Yes" ? 1 : 0,
        notes: row.Notes || null,
        version: 1,
      });
    }
  });

  it("keeps each date's offset from the export time, so three open disputes over $1,000 are due within 48 hours", () => {
    const now = Date.now();
    seedDisputes(now);
    for (const row of exportRows()) {
      const seeded = chargebackTool.get(row.DisputeId);
      expect(seeded?.openedAt, row.DisputeId).toBe(now + Date.parse(row.OpenedOn) - EXPORT_AT);
      expect(seeded?.dueAt, row.DisputeId).toBe(now + Date.parse(row.DueDate) - EXPORT_AT);
    }
    expect(dueSoon().rows.map((r) => r.id)).toEqual(["DSP-20401", "DSP-20406", "DSP-20412"]);
  });

  it("sorts the queue by soonest deadline", () => {
    const { rows } = chargebackTool.list({ filters: {}, limit: 100, offset: 0 });
    const due = rows.map((r) => r.dueAt);
    expect(due).toEqual([...due].sort((a, b) => a - b));
  });
});

describe("chargebacks deadline count", () => {
  it("counts open disputes over $1,000 due within 48 hours with the same query its link opens", () => {
    seedDisputes();
    expectRecordStatsMatchList(chargebackTool);
    const stat = chargebackTool.stats?.find((s) => s.key === "due_soon");
    expect(stat?.source).toEqual({ kind: "records", filters: { due: "over_1000_48h" } });
    expect(dueSoon().total).toBe(3);
    for (const d of dueSoon().rows) {
      expect(d.status).toBe("open");
      expect(d.amountUsdMinor).toBeGreaterThan(100_000);
      expect(d.dueAt).toBeLessThanOrEqual(Date.now() + 48 * HOUR);
    }
  });

  it("drops a dispute from the count once it is no longer open", () => {
    seedDisputes();
    expect(act(refundsAgent, "fight", "DSP-20406").outcome.status).toBe("applied");
    expect(dueSoon().rows.map((r) => r.id)).toEqual(["DSP-20401", "DSP-20412"]);
    seedDisputes();
  });
});

describe("chargebacks rules", () => {
  it("sends a fraud accept over $500 to a refunds manager", () => {
    seedDisputes();
    const result = act(refundsAgent, "accept", "DSP-20401");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "fraud_accept_approval", type: "require_approval", tier: "manager" }),
    );
    expect(chargebackTool.get("DSP-20401")?.status).toBe("open");
    const approval = getApproval(result.outcome.approvalId);
    if (!approval) throw new Error("approval request missing");
    expect(approve(refundsManager, approval.id).outcome.status).toBe("applied");
    expect(chargebackTool.get("DSP-20401")).toMatchObject({
      status: "accepted",
      notes: "Reviewed the case file.",
    });
  });

  it("sends a fight over $2,500 to a refunds manager and marks it fighting once approved", () => {
    seedDisputes();
    const result = act(refundsAgent, "fight", "DSP-20410");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "fight_approval", type: "require_approval", tier: "manager" }),
    );
    expect(chargebackTool.get("DSP-20410")?.status).toBe("open");
    expect(approve(refundsManager, result.outcome.approvalId).outcome.status).toBe("applied");
    expect(chargebackTool.get("DSP-20410")?.status).toBe("fighting");
  });

  it("applies accepts and fights under the limits straight away", () => {
    seedDisputes();
    // Fraud at $457.97, and a $583.47 duplicate: only fraud has the $500 limit.
    expect(act(refundsAgent, "accept", "DSP-20430").outcome.status).toBe("applied");
    expect(act(refundsAgent, "accept", "DSP-20407").outcome.status).toBe("applied");
    // A $2,480 fraud dispute is under the fight limit.
    expect(act(refundsAgent, "fight", "DSP-20401").outcome.status).toBe("applied");
    expect(chargebackTool.get("DSP-20430")?.status).toBe("accepted");
    expect(chargebackTool.get("DSP-20407")?.status).toBe("accepted");
    expect(chargebackTool.get("DSP-20401")?.status).toBe("fighting");
  });

  it("reads both limits from admin-editable settings", () => {
    seedDisputes();
    expect(setConstant(admin, FRAUD_ACCEPT_APPROVAL_USD_KEY, "248000").ok).toBe(true);
    expect(setConstant(admin, FIGHT_APPROVAL_USD_KEY, "100000").ok).toBe(true);
    // Exactly at the limit is not over it.
    expect(act(refundsAgent, "accept", "DSP-20401").outcome.status).toBe("applied");
    expect(act(refundsAgent, "fight", "DSP-20406").outcome.status).toBe("pending_approval");
    setConstant(admin, FRAUD_ACCEPT_APPROVAL_USD_KEY, "50000");
    setConstant(admin, FIGHT_APPROVAL_USD_KEY, "250000");
  });

  it("only lets a refunds manager or admin decide a chargebacks approval", () => {
    seedDisputes();
    const result = act(refundsAgent, "fight", "DSP-20428");
    if (result.outcome.status !== "pending_approval") throw new Error("expected an approval request");
    const approval = getApproval(result.outcome.approvalId);
    if (!approval) throw new Error("approval request missing");
    expect(canDecide(approval, refundsAgent).ok).toBe(false);
    expect(canDecide(approval, kycManager).ok).toBe(false);
    expect(canDecide(approval, refundsManager).ok).toBe(true);
    expect(canDecide(approval, admin).ok).toBe(true);
  });

  it("needs a note on every decision", () => {
    seedDisputes();
    expect(act(refundsAgent, "accept", "DSP-20403", "  ").outcome).toMatchObject({ code: "invalid_input" });
    expect(act(refundsAgent, "fight", "DSP-20403", "").outcome).toMatchObject({ code: "invalid_input" });
    expect(chargebackTool.get("DSP-20403")?.status).toBe("open");
  });
});

describe("chargebacks roles", () => {
  it("lets refunds roles work the queue and keeps other roles out", () => {
    seedDisputes();
    expect(getTool("chargebacks")).toBe(chargebackTool);
    expect(chargebackTool.visibleTo).toEqual(["refunds_agent", "refunds_manager", "admin"]);
    expect(ROLES).toHaveLength(6);
    expect(act(kycReviewer, "accept", "DSP-20403").outcome).toMatchObject({ code: "forbidden_role" });
    expect(act(kycManager, "fight", "DSP-20403").outcome).toMatchObject({ code: "forbidden_role" });
    expect(act(refundsManager, "accept", "DSP-20403").outcome.status).toBe("applied");
  });
});
