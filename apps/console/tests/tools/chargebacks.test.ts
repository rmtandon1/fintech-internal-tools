import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { approve } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import {
  chargebacksTool,
  FIGHT_APPROVAL_USD_KEY,
  FRAUD_ACCEPT_APPROVAL_USD_KEY,
} from "@console/tool-chargebacks";
import { toolsForRole } from "@/registry";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsAgent,
  refundsManager,
  setupHarness,
} from "../helpers/harness";
import { expectRecordStatsMatchList } from "../helpers/stats";

const HOUR = 60 * 60 * 1000;
const EXPORT_AT = Date.parse("2026-09-28T09:00:00Z");
const CSV = resolve(__dirname, "../../../../fixtures/power-apps/chargebacks/Data/disputes.csv");

beforeAll(() => {
  setupHarness();
  registerConstants(chargebacksTool.constants ?? []);
  chargebacksTool.seed?.();
});

function act(actor: Actor, action: string, recordId: string, input: Record<string, unknown>) {
  return executeIntent(actor, {
    tool: "chargebacks",
    action,
    recordId,
    input,
    idempotencyKey: ulid(),
  });
}

function csvRows(): Record<string, string>[] {
  const [header, ...lines] = readFileSync(CSV, "utf8").trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    columns.forEach((column, i) => {
      row[column] = i === columns.length - 1 ? cells.slice(i).join(",") : cells[i];
    });
    return row;
  });
}

function snake(value: string): string {
  return value.toLowerCase().replace(/ /g, "_");
}

describe("chargebacks queue", () => {
  it("seeds the 50 disputes from disputes.csv, keeping each date's offset from the export", () => {
    const now = Date.now();
    const rows = csvRows();
    expect(rows).toHaveLength(50);
    for (const row of rows) {
      const dispute = chargebacksTool.get(row.DisputeId);
      expect(dispute, row.DisputeId).toMatchObject({
        cardNetwork: snake(row.CardNetwork),
        reasonCode: row.ReasonCode,
        reasonCategory: snake(row.ReasonCategory),
        merchant: row.Merchant,
        usdMinor: Math.round(Number(row.AmountUSD) * 100),
        status: snake(row.Status),
        evidenceUploaded: row.EvidenceUploaded === "Yes" ? 1 : 0,
        notes: row.Notes,
      });
      const dueOffset = Date.parse(row.DueDate) - EXPORT_AT;
      const openedOffset = Date.parse(row.OpenedOn) - EXPORT_AT;
      expect(Math.abs(Number(dispute?.dueAt) - now - dueOffset), row.DisputeId).toBeLessThan(HOUR);
      expect(Math.abs(Number(dispute?.openedAt) - now - openedOffset), row.DisputeId).toBeLessThan(
        HOUR,
      );
    }
  });

  it("lists open disputes soonest deadline first, filtered by card network", () => {
    const open = chargebacksTool.list({ filters: {}, limit: 1000, offset: 0 });
    const expected = csvRows().filter((r) =>
      ["Open", "Evidence requested", "Fighting"].includes(r.Status),
    );
    expect(open.total).toBe(expected.length);
    expect(open.rows.map((r) => r.id).sort()).toEqual(expected.map((r) => r.DisputeId).sort());
    const due = open.rows.map((r) => Number(r.dueAt));
    expect(due).toEqual([...due].sort((a, b) => a - b));

    const amex = chargebacksTool.list({ filters: { cardNetwork: "amex" }, limit: 1000, offset: 0 });
    expect(amex.total).toBe(expected.filter((r) => r.CardNetwork === "Amex").length);
    for (const row of amex.rows) {
      expect(row.cardNetwork).toBe("amex");
      expect(["open", "evidence_requested", "fighting"]).toContain(row.status);
    }

    const won = chargebacksTool.list({ filters: { status: "won" }, limit: 1000, offset: 0 });
    expect(won.total).toBe(csvRows().filter((r) => r.Status === "Won").length);
  });

  it("counts three open disputes over $1,000 due within 48 hours", () => {
    const stat = chargebacksTool.stats?.find((s) => s.key === "due_within_48h");
    if (!stat || stat.source.kind !== "records") throw new Error("no deadline count");
    for (const role of chargebacksTool.visibleTo) expect(stat.roles).toContain(role);
    const due = chargebacksTool.list({ filters: stat.source.filters, limit: 1000, offset: 0 });
    expect(due.total).toBe(3);
    expect(due.rows.map((r) => r.id)).toEqual(["DSP-20401", "DSP-20406", "DSP-20412"]);
  });

  it("counts each records stat with the same query its link opens", () => {
    expectRecordStatsMatchList(chargebacksTool);
  });

  it("shows the queue to refunds roles only", () => {
    expect(chargebacksTool.visibleTo).toEqual(["refunds_agent", "refunds_manager", "admin"]);
    expect(toolsForRole("refunds_agent").map((t) => t.name)).toContain("chargebacks");
    expect(toolsForRole("kyc_manager").map((t) => t.name)).not.toContain("chargebacks");
    expect(act(kycManager, "accept", "DSP-20419", { note: "Not my queue" }).outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
    });
    expect(act(kycReviewer, "fight", "DSP-20419", { note: "Not my queue" }).outcome).toMatchObject({
      status: "error",
      code: "forbidden_role",
    });
  });
});

describe("chargebacks rules", () => {
  it("requires a note for every decision", () => {
    for (const action of ["accept", "fight"]) {
      expect(act(refundsAgent, action, "DSP-20419", {}).outcome, action).toMatchObject({
        status: "error",
        code: "invalid_input",
      });
      expect(act(refundsAgent, action, "DSP-20419", { note: "  " }).outcome, action).toMatchObject({
        status: "error",
        code: "invalid_input",
      });
    }
    expect(chargebacksTool.get("DSP-20419")?.status).toBe("open");
  });

  it("sends a fraud accept over $500 to a refunds manager", () => {
    const result = act(refundsAgent, "accept", "DSP-20401", { note: "No response from merchant" });
    if (result.outcome.status !== "pending_approval") {
      throw new Error(`expected an approval request, got ${result.outcome.status}`);
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "fraud_accept_approval",
        type: "require_approval",
        tier: "manager",
        allowedRoles: ["refunds_manager", "admin"],
      }),
    );
    expect(chargebacksTool.get("DSP-20401")?.status).toBe("open");
  });

  it("accepts a fraud dispute of $500 or less, and a large non-fraud dispute, straight away", () => {
    const small = act(refundsAgent, "accept", "DSP-20430", { note: "Too small to fight" });
    expect(small.outcome.status).toBe("applied");
    expect(chargebacksTool.get("DSP-20430")).toMatchObject({
      status: "accepted",
      notes: "Too small to fight",
    });

    const duplicate = act(refundsAgent, "accept", "DSP-20410", { note: "Charged twice" });
    expect(duplicate.outcome.status).toBe("applied");
    expect(chargebacksTool.get("DSP-20410")?.status).toBe("accepted");
  });

  it("sends a fight over $2,500 to a refunds manager", () => {
    const result = act(refundsAgent, "fight", "DSP-20428", { note: "Cancellation not received" });
    if (result.outcome.status !== "pending_approval") {
      throw new Error(`expected an approval request, got ${result.outcome.status}`);
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "fight_approval",
        type: "require_approval",
        tier: "manager",
        allowedRoles: ["refunds_manager", "admin"],
      }),
    );
    expect(chargebacksTool.get("DSP-20428")?.status).toBe("open");
  });

  it("fights a dispute of $2,500 or less straight away", () => {
    const result = act(refundsAgent, "fight", "DSP-20406", { note: "Listing matches the item" });
    expect(result.outcome.status).toBe("applied");
    expect(chargebacksTool.get("DSP-20406")).toMatchObject({
      status: "fighting",
      notes: "Listing matches the item",
    });
  });

  it("applies a held accept only when a refunds manager approves", () => {
    const result = act(refundsAgent, "accept", "DSP-20401", { note: "Cardholder is right" });
    if (result.outcome.status !== "pending_approval") {
      throw new Error(`expected an approval request, got ${result.outcome.status}`);
    }
    const id = result.outcome.approvalId;
    expect(approve(refundsAgent, id).outcome).toMatchObject({ status: "error" });
    expect(approve(kycManager, id).outcome).toMatchObject({ status: "error" });
    expect(chargebacksTool.get("DSP-20401")?.status).toBe("open");

    expect(approve(refundsManager, id, "Agreed").outcome.status).toBe("applied");
    expect(chargebacksTool.get("DSP-20401")).toMatchObject({
      status: "accepted",
      notes: "Cardholder is right",
    });
  });

  it("reads both approval limits from settings", () => {
    expect(chargebacksTool.constants?.map((c) => [c.key, c.value])).toEqual([
      [FRAUD_ACCEPT_APPROVAL_USD_KEY, 50_000],
      [FIGHT_APPROVAL_USD_KEY, 250_000],
    ]);
    expect(setConstant(admin, FRAUD_ACCEPT_APPROVAL_USD_KEY, "10000").ok).toBe(true);
    expect(setConstant(admin, FIGHT_APPROVAL_USD_KEY, "50000").ok).toBe(true);
    try {
      const fraud = act(refundsAgent, "accept", "DSP-20417", { note: "Merchant has no proof" });
      expect(fraud.outcome.status).toBe("pending_approval");
      const fight = act(refundsAgent, "fight", "DSP-20419", { note: "Refund already issued" });
      expect(fight.outcome.status).toBe("pending_approval");
    } finally {
      setConstant(admin, FRAUD_ACCEPT_APPROVAL_USD_KEY, "50000");
      setConstant(admin, FIGHT_APPROVAL_USD_KEY, "250000");
    }
    const fight = act(refundsAgent, "fight", "DSP-20419", { note: "Refund already issued" });
    expect(fight.outcome.status).toBe("applied");
  });
});
