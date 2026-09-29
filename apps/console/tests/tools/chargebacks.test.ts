import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { DEMO_ACTORS } from "@console/engine/actor";
import { approve, canDecide, getApproval } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  chargebackTool,
  EXPORT_SNAPSHOT,
  FRAUD_ACCEPT_APPROVAL_USD_KEY,
} from "@console/tool-chargebacks";
import { seedChargebacks } from "@console/tool-chargebacks/seed";
import {
  admin,
  kycManager,
  kycReviewer,
  refundsAgent,
  refundsManager,
  setupHarness,
} from "../helpers/harness";
import { expectRecordStatsMatchList } from "../helpers/stats";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim();
const CSV = join(ROOT, "fixtures/power-apps/chargebacks/Data/disputes.csv");
const HOUR = 60 * 60 * 1000;

type CsvRow = Record<string, string>;

function readCsv(): CsvRow[] {
  const [header, ...lines] = readFileSync(CSV, "utf8").trim().split("\n");
  const names = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(names.map((n, i) => [n, cells[i]]));
  });
}

const EXPORT = readCsv();
const ids = (value: string) => value.toLowerCase().replaceAll(" ", "_");

/** Export column to console field; DisputeId is the record id. */
const FIELD_FOR: Record<string, string> = {
  CardNetwork: "cardNetwork",
  ReasonCode: "reasonCode",
  ReasonCategory: "reasonCategory",
  Merchant: "merchant",
  AmountUSD: "amountMinor",
  OpenedOn: "openedAt",
  DueDate: "dueAt",
  Status: "status",
  EvidenceUploaded: "evidenceUploaded",
  Notes: "notes",
};

beforeAll(() => {
  setupHarness();
  registerConstants(chargebackTool.constants ?? []);
  chargebackTool.seed?.();
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

function held(actor: Actor, action: string, recordId: string) {
  const result = act(actor, action, recordId, { note: "Checked the case file." });
  if (result.outcome.status !== "pending_approval") {
    throw new Error(`expected an approval request, got ${result.outcome.status}`);
  }
  return result.outcome;
}

describe("chargebacks queue", () => {
  it("seeds the 50 disputes from disputes.csv with every export field", () => {
    expect(EXPORT).toHaveLength(50);
    expect(chargebackTool.list({ filters: {}, limit: 0, offset: 0 }).total).toBe(50);
    const declared = [...chargebackTool.fields.map((f) => f.name), chargebackTool.statusField];
    for (const field of Object.values(FIELD_FOR)) expect(declared).toContain(field);
    for (const row of EXPORT) {
      const d = chargebackTool.get(row.DisputeId);
      expect(d, row.DisputeId).toMatchObject({
        cardNetwork: ids(row.CardNetwork),
        reasonCode: row.ReasonCode,
        reasonCategory: ids(row.ReasonCategory),
        merchant: row.Merchant,
        amountMinor: Math.round(Number(row.AmountUSD) * 100),
        status: ids(row.Status),
        evidenceUploaded: row.EvidenceUploaded === "Yes" ? 1 : 0,
        notes: row.Notes,
      });
    }
  });

  it("keeps each deadline's offset from the export snapshot", () => {
    const now = Date.parse("2027-03-01T12:00:00Z");
    seedChargebacks(now);
    const snapshot = Date.parse(EXPORT_SNAPSHOT);
    for (const row of EXPORT) {
      const d = chargebackTool.get(row.DisputeId);
      expect(d?.dueAt, row.DisputeId).toBe(now + Date.parse(row.DueDate) - snapshot);
      expect(d?.openedAt, row.DisputeId).toBe(now + Date.parse(row.OpenedOn) - snapshot);
    }
    chargebackTool.seed?.();
  });

  it("lists open work soonest deadline first, filterable by network", () => {
    const open = chargebackTool.list({ filters: { queue: "open_work" }, limit: 100, offset: 0 });
    const expected = EXPORT.filter((r) =>
      ["Open", "Evidence requested", "Fighting"].includes(r.Status),
    );
    expect(open.total).toBe(expected.length);
    const due = open.rows.map((r) => Number(r.dueAt));
    expect(due).toEqual([...due].sort((a, b) => a - b));

    const visa = chargebackTool.list({
      filters: { queue: "open_work", cardNetwork: "visa" },
      limit: 100,
      offset: 0,
    });
    expect(visa.total).toBe(expected.filter((r) => r.CardNetwork === "Visa").length);
    for (const row of visa.rows) expect(row.cardNetwork).toBe("visa");
  });

  it("counts the 3 open disputes over $1,000 due within 48 hours", () => {
    const stat = chargebackTool.stats?.find((s) => s.key === "due_48h");
    expect(stat?.source).toEqual({ kind: "records", filters: { deadline: "due_48h" } });
    expect(stat?.roles).toEqual(rolesFor("refunds", "agent"));
    const due = chargebackTool.list({ filters: { deadline: "due_48h" }, limit: 100, offset: 0 });
    expect(due.total).toBe(3);
    expect(due.rows.map((r) => r.id).sort()).toEqual(["DSP-20401", "DSP-20406", "DSP-20412"]);
    const now = Date.now();
    for (const row of due.rows) {
      expect(row.status).toBe("open");
      expect(row.amountMinor).toBeGreaterThan(100_000);
      expect(row.dueAt).toBeLessThanOrEqual(now + 48 * HOUR);
    }
  });

  it("counts each records stat with the same query its link opens", () => {
    expectRecordStatsMatchList(chargebackTool);
  });

  it("opens the queue to the refunds roles only", () => {
    expect(chargebackTool.visibleTo).toEqual(rolesFor("refunds", "agent"));
    for (const action of chargebackTool.actions) {
      expect(action.allowedRoles, action.name).toEqual(rolesFor("refunds", "agent"));
    }
    const note = { note: "Not my queue." };
    expect(act(kycReviewer, "accept", "DSP-20403", note).outcome).toMatchObject({
      code: "forbidden_role",
    });
    expect(act(DEMO_ACTORS.engineer, "fight", "DSP-20403", note).outcome).toMatchObject({
      code: "forbidden_role",
    });
  });
});

describe("chargebacks rules", () => {
  it("holds a fraud accept over $500 for a refunds manager", () => {
    const outcome = held(refundsAgent, "accept", "DSP-20401");
    expect(outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "fraud_accept_approval",
        type: "require_approval",
        tier: "manager",
        allowedRoles: ["refunds_manager", "admin"],
      }),
    );
    expect(chargebackTool.get("DSP-20401")?.status).toBe("open");
  });

  it("accepts a fraud dispute at $500 or less, and a non-fraud dispute, straight away", () => {
    // DSP-20430 is fraud at $457.97; with the limit set to exactly that, it still passes.
    expect(setConstant(admin, FRAUD_ACCEPT_APPROVAL_USD_KEY, "45797").ok).toBe(true);
    const small = act(refundsAgent, "accept", "DSP-20430", { note: "Cardholder's claim holds." });
    expect(setConstant(admin, FRAUD_ACCEPT_APPROVAL_USD_KEY, "50000").ok).toBe(true);
    expect(small.outcome.status).toBe("applied");
    expect(chargebackTool.get("DSP-20430")).toMatchObject({
      status: "accepted",
      notes: "Cardholder's claim holds.",
      decidedBy: refundsAgent.id,
    });

    // DSP-20407 is a $583.47 duplicate: over $500 but not fraud.
    const duplicate = act(refundsAgent, "accept", "DSP-20407", { note: "Charged twice." });
    expect(duplicate.outcome.status).toBe("applied");
    expect(chargebackTool.get("DSP-20407")?.status).toBe("accepted");
  });

  it("holds a fight over $2,500 for a refunds manager", () => {
    const outcome = held(refundsAgent, "fight", "DSP-20410");
    expect(outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "fight_approval",
        type: "require_approval",
        tier: "manager",
        allowedRoles: ["refunds_manager", "admin"],
      }),
    );
    expect(chargebackTool.get("DSP-20410")?.status).toBe("open");
  });

  it("fights a dispute at $2,500 or less straight away", () => {
    const result = act(refundsAgent, "fight", "DSP-20431", { note: "Listing matches the item." });
    expect(result.outcome.status).toBe("applied");
    expect(chargebackTool.get("DSP-20431")).toMatchObject({
      status: "fighting",
      notes: "Listing matches the item.",
    });
  });

  it("only lets a refunds manager or admin decide a chargebacks approval", () => {
    const outcome = held(refundsAgent, "fight", "DSP-20428");
    const approval = getApproval(outcome.approvalId);
    if (!approval) throw new Error("approval request missing");
    expect(canDecide(approval, refundsAgent).ok).toBe(false);
    expect(canDecide(approval, kycManager).ok).toBe(false);
    expect(canDecide(approval, admin).ok).toBe(true);
    expect(canDecide(approval, refundsManager).ok).toBe(true);

    expect(approve(refundsManager, outcome.approvalId, "Evidence is strong").outcome.status).toBe(
      "applied",
    );
    expect(chargebackTool.get("DSP-20428")?.status).toBe("fighting");
  });

  it("needs a note on every decision", () => {
    for (const action of ["accept", "fight"]) {
      for (const input of [{}, { note: "" }, { note: "   " }]) {
        expect(act(refundsAgent, action, "DSP-20438", input).outcome, action).toMatchObject({
          status: "error",
          code: "invalid_input",
        });
      }
    }
    expect(chargebackTool.get("DSP-20438")?.status).toBe("open");
  });
});
