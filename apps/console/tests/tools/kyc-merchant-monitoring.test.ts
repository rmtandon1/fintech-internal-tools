import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { sqlite } from "@console/db-core";
import { approve } from "@console/engine/approvals";
import { listAuditEvents } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import { previewActions } from "@console/engine/policy/preview";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import {
  COMPANIES_HOUSE_API_KEY_ENV,
  LOOKUP_TIMEOUT_MS,
  MERCHANT_MONITORING_ACTOR,
  MERCHANT_MONITORING_KEY,
  RECHECK_MERCHANTS_ACTION,
  RECORDED_FAILURES,
  caseFile,
  companiesHouseTransport,
  dailyRecheckKey,
  kycTool,
  liveTransport,
  lookupCompany,
  recordedTransport,
  registryDifferenceId,
  runScheduledRecheck,
  useCompaniesHouseTransport,
  type CompaniesHouseTransport,
  type KycCase,
  type ProcessRunner,
  type RecordedResponse,
} from "@console/tool-kyc";
import { kycCases } from "@console/tool-kyc/schema";
import { queueOf, refundTool, type Refund } from "@console/tool-refunds";
import { merchantRegistryStatus, refunds } from "@console/tool-refunds/schema";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

// Seeded approved UK merchants: kyc_0104 Wilko (00365335, in liquidation on the
// recording), kyc_0105 Lakeland, kyc_0106 Timpson, kyc_0107 Screwfix (all active).
// Wilko's refunds are rfnd_0015–rfnd_0019; Lakeland's rfnd_0020.
const MERCHANTS = ["kyc_0104", "kyc_0105", "kyc_0106", "kyc_0107"];
const WILKO_REFUNDS = ["rfnd_0015", "rfnd_0016", "rfnd_0017", "rfnd_0018", "rfnd_0019"];
// A merchant with no KYC case, so nothing to link.
const KESTREL_REFUND = "rfnd_0011";

/** Replays recordings and notes every company number asked for. */
function counting(overrides: Record<string, RecordedResponse> = {}): {
  calls: string[];
  transport: CompaniesHouseTransport;
} {
  const calls: string[] = [];
  const inner = recordedTransport(overrides);
  return {
    calls,
    transport: {
      testData: true,
      get: (n) => {
        calls.push(n);
        return inner.get(n);
      },
    },
  };
}

function recheck(actor: Actor = admin) {
  return executeIntent(actor, {
    tool: "kyc",
    action: RECHECK_MERCHANTS_ACTION,
    recordId: null,
    input: {},
    idempotencyKey: ulid(),
  });
}

function kycCase(id: string): KycCase {
  const record = kycTool.get(id);
  if (!record) throw new Error(`no kyc case ${id}`);
  return record as KycCase;
}

function refund(id: string): Refund {
  const record = refundTool.get(id);
  if (!record) throw new Error(`no refund ${id}`);
  return record as Refund;
}

function executeTrace(id: string) {
  return previewActions(refundTool, refund(id), analyst).find((p) => p.action === "execute")?.decision?.trace ?? [];
}

/** An approved UK business case for a company that is not seeded. */
function addMerchant(id: string, documentNumber: string): void {
  const now = Date.now();
  db.insert(kycCases)
    .values({
      id,
      customerName: `Test merchant ${id}`,
      email: `${id}@merchant.example.com`,
      dateOfBirth: "2000-01-01",
      documentType: "company_registry",
      documentNumber,
      country: "GB",
      segment: "business",
      riskScore: 20,
      riskTier: "low",
      sanctionsHit: 0,
      pep: 0,
      documentsComplete: 1,
      status: "approved",
      openedAt: now,
      dueAt: now,
      lastNote: null,
      decidedBy: null,
      version: 1,
    })
    .run();
}

function addRefund(id: string, merchant: string, merchantCaseId: string | null): void {
  const base = refund("rfnd_0015");
  db.insert(refunds)
    .values({ ...base, id, paymentId: `pay_${id}`, merchant, merchantCaseId, queue: undefined })
    .run();
}

function snapshot(ids: string[]) {
  return ids.map((id) => ({ record: kycCase(id), file: caseFile(id) }));
}

beforeAll(() => {
  setupHarness();
  registerConstants([...(kycTool.constants ?? []), ...(refundTool.constants ?? [])]);
});

beforeEach(() => {
  db.delete(kycCases).where(like(kycCases.id, "kyc_t%")).run();
  db.delete(refunds).where(like(refunds.id, "rfnd_t%")).run();
  db.delete(merchantRegistryStatus).run();
  kycTool.seed?.();
  refundTool.seed?.();
  expect(setConstant(admin, MERCHANT_MONITORING_KEY, "1").ok).toBe(true);
  useCompaniesHouseTransport(recordedTransport());
});

afterAll(() => {
  useCompaniesHouseTransport(null);
});

describe("kyc merchant monitoring", () => {
  it("rechecks only approved UK business cases, with one lookup per merchant per run", () => {
    const others = kycTool
      .list({ filters: {}, limit: 1000, offset: 0 })
      .rows.map((r) => r.id)
      .filter((id) => !MERCHANTS.includes(id));
    const before = snapshot(others);
    const { calls, transport } = counting();
    useCompaniesHouseTransport(transport);

    const { outcome } = recheck();
    expect(outcome.status).toBe("applied");
    expect(calls).toEqual(["00365335", "00809688", "00675216", "03006378"]);
    expect(snapshot(others)).toEqual(before);
  });

  it("puts administration, liquidation and dissolved on the case file and holds approval through declared_vs_found", () => {
    addMerchant("kyc_t_admin", "12401266");
    addMerchant("kyc_t_dissolved", "NI016353");
    const approveRules = kycTool.actions.find((a) => a.name === "approve")?.rules.length;

    expect(recheck().outcome.status).toBe("applied");

    const expected: [string, string, string][] = [
      ["kyc_t_admin", "administration", "APPLETREE FARM CRESSING LIMITED"],
      ["kyc_0104", "liquidation", "WL REALISATIONS (2023) LIMITED"],
      ["kyc_t_dissolved", "dissolved", "YOUTH FASHIONS LIMITED"],
    ];
    for (const [id, status, name] of expected) {
      const file = caseFile(id);
      const difference = file.differences.find((d) => d.id === registryDifferenceId(id));
      expect(difference).toMatchObject({ topic: "Company status", declared: "active", severity: "material" });
      expect(difference?.found).toContain(status);
      expect(difference?.found).toContain(name);
      expect(file.checks.find((c) => c.kind === "company_registry")).toMatchObject({ result: "failed" });
      expect(kycCase(id).status).toBe("escalated");

      const { outcome } = executeIntent(analyst, {
        tool: "kyc",
        action: "approve",
        recordId: id,
        input: {},
        idempotencyKey: ulid(),
      });
      expect(outcome.status).toBe("pending_approval");
      expect(outcome.status === "pending_approval" ? outcome.trace : []).toContainEqual(
        expect.objectContaining({ type: "require_approval", rule: "declared_vs_found", tier: "manager" }),
      );
    }
    expect(kycTool.actions.find((a) => a.name === "approve")?.rules.length).toBe(approveRules);
  });

  it("sends the merchant's pending and later refunds to a manager, naming the rule, merchant and status", () => {
    for (const id of WILKO_REFUNDS) expect(queueOf(refund(id))).toBe("analyst");
    expect(recheck().outcome.status).toBe("applied");

    addRefund("rfnd_t_later", "Wilko", "kyc_0104");
    for (const id of [...WILKO_REFUNDS, "rfnd_t_later"]) {
      expect(queueOf(refund(id))).toBe("manager");
      const hold = executeTrace(id).find((o) => o.rule === "merchant_insolvency");
      expect(hold).toMatchObject({ type: "require_approval", tier: "manager" });
      const reason = hold && "reason" in hold ? hold.reason : "";
      expect(reason).toContain("Wilko");
      expect(reason).toContain("liquidation");
      expect(reason).not.toContain(refund(id).customerEmail);
      expect(reason).not.toContain(refund(id).cardLast4);
    }
    const listed = refundTool.list({ filters: { queue: "analyst" }, limit: 1000, offset: 0 }).rows.map((r) => r.id);
    for (const id of WILKO_REFUNDS) expect(listed).not.toContain(id);
    expect(queueOf(refund("rfnd_0020"))).toBe("analyst");
  });

  it("links refunds to the merchant case by id, backfills existing refunds, and never matches by name", () => {
    expect(WILKO_REFUNDS.map((id) => refund(id).merchantCaseId)).toEqual(WILKO_REFUNDS.map(() => "kyc_0104"));
    expect(refund("rfnd_0020").merchantCaseId).toBe("kyc_0105");

    const migration = readFileSync(resolve("drizzle/0011_merchant_case_link.sql"), "utf8");
    const backfill = migration.split("--> statement-breakpoint").find((s) => s.includes("UPDATE `refunds`"));
    if (!backfill) throw new Error("migration has no backfill");
    db.update(refunds).set({ merchantCaseId: null }).run();
    sqlite.exec(backfill);
    expect(refund("rfnd_0015").merchantCaseId).toBe("kyc_0104");
    expect(refund("rfnd_0020").merchantCaseId).toBe("kyc_0105");
    expect(refund("rfnd_0001").merchantCaseId).toBe("kyc_0003");
    expect(refund(KESTREL_REFUND).merchantCaseId).toBeNull();

    expect(recheck().outcome.status).toBe("applied");
    addRefund("rfnd_t_name_only", "Wilko", null);
    addRefund("rfnd_t_renamed", "WL Realisations", "kyc_0104");
    expect(queueOf(refund("rfnd_t_name_only"))).toBe("analyst");
    expect(queueOf(refund("rfnd_t_renamed"))).toBe("manager");
  });

  it("shows the merchant's refunds on its case and the merchant case on each refund", () => {
    const activity = kycTool.linkedActivity?.(kycCase("kyc_0104"), admin);
    expect(activity?.rows.map((r) => r.id).sort()).toEqual(WILKO_REFUNDS);
    expect(activity?.summary.count).toBe(WILKO_REFUNDS.length);
    expect(kycTool.linkedActivity?.(kycCase("kyc_0105"), admin)?.rows.map((r) => r.id)).toEqual(["rfnd_0020"]);

    expect(refundTool.fields.find((f) => f.name === "merchantCaseId")).toMatchObject({ label: "Merchant case" });
    expect(refundTool.sections.find((s) => s.title === "Payment")?.fields).toContain("merchantCaseId");
  });

  it("changes nothing for an active company, and a rerun adds no second check, difference or hold", () => {
    const active = ["kyc_0105", "kyc_0106", "kyc_0107"];
    const before = snapshot(active);
    expect(recheck().outcome.status).toBe("applied");
    expect(snapshot(active)).toEqual(before);

    const flagged = { record: kycCase("kyc_0104"), file: caseFile("kyc_0104") };
    const standing = db.select().from(merchantRegistryStatus).all();
    // A manager reviews the finding and keeps the merchant approved.
    const { outcome: approved } = executeIntent(analyst, {
      tool: "kyc",
      action: "approve",
      recordId: "kyc_0104",
      input: {},
      idempotencyKey: ulid(),
    });
    if (approved.status !== "pending_approval") throw new Error("expected a manager approval");
    expect(approve(manager, approved.approvalId).outcome.status).toBe("applied");
    expect(kycCase("kyc_0104").status).toBe("approved");

    expect(recheck().outcome.status).toBe("applied");
    expect(kycCase("kyc_0104").status).toBe("approved");
    expect(caseFile("kyc_0104")).toEqual(flagged.file);
    expect(db.select().from(merchantRegistryStatus).all()).toEqual(standing);
    expect(snapshot(active)).toEqual(before);
  });

  it("records couldn't check for a timeout, an error and not found, and holds the case but not its refunds", () => {
    const notFound = recordedTransport().get("99999999");
    useCompaniesHouseTransport(
      recordedTransport({
        "00809688": RECORDED_FAILURES.timeout,
        "00675216": RECORDED_FAILURES.error,
        "03006378": notFound,
      }),
    );
    expect(recheck().outcome.status).toBe("applied");

    const expected: [string, string][] = [
      ["kyc_0105", "couldn't check (timed out)"],
      ["kyc_0106", "couldn't check (error 401)"],
      ["kyc_0107", "couldn't check (not found)"],
    ];
    for (const [id, found] of expected) {
      const file = caseFile(id);
      expect(file.differences.find((d) => d.id === registryDifferenceId(id))).toMatchObject({
        found,
        severity: "material",
      });
      expect(file.checks.find((c) => c.kind === "company_registry")).toMatchObject({ result: "needs_review" });
      expect(kycCase(id).status).toBe("escalated");
      expect(kycCase(id).materialDifferences).toBeGreaterThan(0);
    }
    expect(queueOf(refund("rfnd_0020"))).toBe("analyst");
    expect(executeTrace("rfnd_0020")).toContainEqual({ type: "allow", rule: "merchant_insolvency" });
    expect(db.select().from(merchantRegistryStatus).all().map((r) => r.caseId)).toEqual(["kyc_0104"]);
  });

  it("runs daily and from Recheck now through the governed, audited action", () => {
    const since = Date.now();
    expect(kycTool.adminActions).toEqual([{ label: "Recheck now", action: RECHECK_MERCHANTS_ACTION }]);
    const offered = previewActions(kycTool, kycCase("kyc_0104"), admin).find((p) => p.action === RECHECK_MERCHANTS_ACTION);
    expect(offered?.offered).toBe(false);
    expect(recheck(analyst).outcome).toMatchObject({ status: "error", code: "forbidden_role" });

    const now = Date.UTC(2026, 8, 30, 6);
    const first = runScheduledRecheck(now);
    expect(first.replayed).toBe(false);
    expect(first.outcome.status).toBe("applied");
    const summary = first.outcome.status === "applied" ? first.outcome.summary : "";
    for (const id of MERCHANTS) expect(summary).toContain(id);
    expect(summary).toContain("kyc_0104 liquidation");
    expect(summary).toContain("test data");
    expect(runScheduledRecheck(now + 60_000).replayed).toBe(true);
    expect(dailyRecheckKey(now)).not.toBe(dailyRecheckKey(now + 24 * 60 * 60 * 1000));

    const system = listAuditEvents({ tool: "kyc", action: RECHECK_MERCHANTS_ACTION, actorId: MERCHANT_MONITORING_ACTOR.id, since });
    expect(system.total).toBe(1);
    expect(system.rows[0]).toMatchObject({ event: "applied", actorRole: "admin" });

    expect(recheck(admin).outcome.status).toBe("applied");
    expect(listAuditEvents({ tool: "kyc", action: RECHECK_MERCHANTS_ACTION, actorId: admin.id, since }).total).toBe(1);
  });

  it("keeps COMPANIES_HOUSE_API_KEY on the server and out of results and audit", () => {
    const key = "test-key-never-shown";
    const seen: { args: string[]; env: Record<string, string>; timeout: number }[] = [];
    const runner: ProcessRunner = (_file, args, options) => {
      seen.push({ args, ...options });
      const n = String(args.at(-1)).split("/").at(-1) ?? "";
      return JSON.stringify(recordedTransport().get(n));
    };
    useCompaniesHouseTransport(liveTransport(key, runner));
    const { outcome } = recheck();
    expect(outcome.status).toBe("applied");

    expect(seen).toHaveLength(MERCHANTS.length);
    for (const call of seen) {
      expect(call.env).toEqual({ [COMPANIES_HOUSE_API_KEY_ENV]: key });
      expect(call.args.join(" ")).not.toContain(key);
      expect(call.args.at(-1)).toMatch(/^https:\/\/api\.company-information\.service\.gov\.uk\/company\/\w{8}$/);
      expect(call.timeout).toBeLessThanOrEqual(5_000);
    }
    expect(LOOKUP_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    expect(caseFile("kyc_0104").checks.find((c) => c.kind === "company_registry")?.source).toBe("Companies House");
    const audit = listAuditEvents({ tool: "kyc", action: RECHECK_MERCHANTS_ACTION, limit: 1 }).rows[0];
    expect(JSON.stringify(audit)).not.toContain(key);
    expect(JSON.stringify(outcome)).not.toContain(key);
    expect(JSON.stringify(caseFile("kyc_0104"))).not.toContain(key);

    const killed = liveTransport(key, () => {
      throw new Error("spawnSync ETIMEDOUT");
    });
    expect(lookupCompany(killed, "GB00809688")).toMatchObject({ kind: "couldnt_check", reason: "timed out", testData: false });

    useCompaniesHouseTransport(null);
    expect(companiesHouseTransport({ [COMPANIES_HOUSE_API_KEY_ENV]: key }).testData).toBe(false);
    expect(companiesHouseTransport({}).testData).toBe(true);
    expect(readFileSync(resolve("../../.env.example"), "utf8")).toMatch(/^COMPANIES_HOUSE_API_KEY=$/m);
  });

  it("replays recorded responses for every outcome and labels them test data", () => {
    const t = recordedTransport();
    expect(lookupCompany(t, "GB00809688")).toMatchObject({ kind: "found", companyStatus: "active", testData: true });
    expect(lookupCompany(t, "12401266")).toMatchObject({ kind: "found", companyStatus: "administration" });
    expect(lookupCompany(t, "GB00365335")).toMatchObject({
      kind: "found",
      companyStatus: "liquidation",
      companyName: "WL REALISATIONS (2023) LIMITED",
    });
    expect(lookupCompany(t, "NI016353")).toMatchObject({ kind: "found", companyStatus: "dissolved" });
    expect(lookupCompany(t, "99999999")).toMatchObject({ kind: "couldnt_check", reason: "not found" });
    const failing = recordedTransport({ "00809688": RECORDED_FAILURES.error, "00675216": RECORDED_FAILURES.timeout });
    expect(lookupCompany(failing, "00809688")).toMatchObject({ kind: "couldnt_check", reason: "error 401" });
    expect(lookupCompany(failing, "00675216")).toMatchObject({ kind: "couldnt_check", reason: "timed out" });
    // Every seeded merchant has a real recording under its own number.
    for (const id of MERCHANTS) {
      const n = kycCase(id).documentNumber.replace(/^GB/, "");
      expect(lookupCompany(t, n)).toMatchObject({ kind: "found", companyNumber: n });
    }

    expect(recheck().outcome.status).toBe("applied");
    expect(caseFile("kyc_0104").checks.find((c) => c.kind === "company_registry")?.source).toBe(
      "Companies House (test data)",
    );
  });

  it("declares kyc.merchant_monitoring at 0, and at 0 makes no lookup and holds nothing", () => {
    expect(kycTool.constants?.find((c) => c.key === MERCHANT_MONITORING_KEY)).toMatchObject({
      value: 0,
      type: "number",
      tool: "kyc",
    });
    expect(recheck().outcome.status).toBe("applied");
    expect(queueOf(refund("rfnd_0015"))).toBe("manager");

    expect(setConstant(admin, MERCHANT_MONITORING_KEY, "0").ok).toBe(true);
    const before = snapshot(MERCHANTS);
    const { calls, transport } = counting();
    useCompaniesHouseTransport(transport);
    const { outcome } = recheck();
    expect(outcome.status).toBe("denied");
    expect(outcome.status === "denied" ? outcome.trace : []).toContainEqual(
      expect.objectContaining({ type: "deny", rule: "merchant_monitoring_on" }),
    );
    expect(calls).toEqual([]);
    expect(snapshot(MERCHANTS)).toEqual(before);
    for (const id of WILKO_REFUNDS) expect(queueOf(refund(id))).toBe("analyst");
  });
});
