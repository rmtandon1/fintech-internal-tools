import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { auditLog } from "@console/db-core/engine-schema";
import { approve } from "@console/engine/approvals";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import { previewActions } from "@console/engine/policy/preview";
import type { Actor, IntentOutcome } from "@console/engine/types";
import {
  basicAuthorization,
  caseFile,
  COMPANIES_HOUSE_API,
  kycTool,
  lookupCompany,
  recordedAnswer,
  type CompaniesHouseRequest,
} from "@console/tool-kyc";
import { kycCases } from "@console/tool-kyc/schema";
import { kycManager, kycReviewer, setupHarness } from "../helpers/harness";

const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  delete process.env.COMPANIES_HOUSE_API_KEY;
  delete process.env.COMPANIES_HOUSE_API_BASE;
  setupHarness();
  registerConstants(kycTool.constants ?? []);
  kycTool.seed?.();
});

afterEach(() => {
  delete process.env.COMPANIES_HOUSE_API_KEY;
  delete process.env.COMPANIES_HOUSE_API_BASE;
  vi.restoreAllMocks();
});

function act(actor: Actor, action: string, recordId: string) {
  return executeIntent(actor, {
    tool: "kyc",
    action,
    recordId,
    input: {},
    idempotencyKey: ulid(),
  });
}

function check(recordId: string) {
  return act(kycReviewer, "check_companies_house", recordId);
}

function traceOf(outcome: IntentOutcome) {
  if (!("trace" in outcome) || !outcome.trace) throw new Error("outcome has no trace");
  return outcome.trace;
}

function registry(recordId: string) {
  return caseFile(recordId).checks.find((c) => c.kind === "company_registry");
}

function material(recordId: string) {
  return caseFile(recordId).differences.filter((d) => d.severity === "material");
}

/** A low-risk open case that nothing but the Companies House check would hold. */
function makeCase(
  id: string,
  documentNumber: string,
  overrides: Partial<typeof kycCases.$inferInsert> = {},
): void {
  const now = Date.now();
  db.insert(kycCases)
    .values({
      id,
      customerName: `Company ${id}`,
      email: `kyb@${id}.example.com`,
      dateOfBirth: "2015-01-01",
      documentType: "company_registry",
      documentNumber,
      country: "GB",
      segment: "business",
      riskScore: 20,
      riskTier: "low",
      sanctionsHit: 0,
      pep: 0,
      documentsComplete: 1,
      status: "pending_review",
      openedAt: now - HOUR,
      dueAt: now + 47 * HOUR,
      lastNote: null,
      decidedBy: null,
      version: 1,
      ...overrides,
    })
    .run();
}

function expectHeldByDeclaredVsFound(recordId: string, count: number) {
  const result = act(kycReviewer, "approve", recordId);
  expect(result.outcome.status).toBe("pending_approval");
  const nonAllow = traceOf(result.outcome).filter((o) => o.type !== "allow");
  expect(nonAllow).toEqual([
    expect.objectContaining({
      rule: "declared_vs_found",
      type: "require_approval",
      tier: "manager",
      reason: `${count} material difference${count === 1 ? "" : "s"} between what the customer declared and what the checks found`,
    }),
  ]);
  return result;
}

function expectCouldNotCheck(recordId: string, why: string) {
  expect(check(recordId).outcome.status).toBe("applied");
  expect(registry(recordId)).toMatchObject({
    result: "needs_review",
    detail: `Test data: Couldn't check: ${why}`,
  });
  expect(material(recordId)).toEqual([
    expect.objectContaining({
      topic: "Company registry",
      declared: "Registered with Companies House",
      found: `Couldn't check: ${why}`,
    }),
  ]);
  expectHeldByDeclaredVsFound(recordId, 1);
}

describe("kyc Companies House check", () => {
  it("only UK business cases are checked; consumer and non-UK cases are untouched", () => {
    makeCase("kyc_ch_consumer", "GB08123456", { segment: "consumer", documentType: "passport" });
    makeCase("kyc_ch_de", "DE08123456", { country: "DE" });
    for (const id of ["kyc_ch_consumer", "kyc_ch_de", "kyc_0001"]) {
      const before = { record: kycTool.get(id), file: caseFile(id) };
      const result = check(id);
      expect(result.outcome.status).toBe("denied");
      expect(traceOf(result.outcome)).toEqual([
        expect.objectContaining({ rule: "companies_house_uk_business", type: "deny" }),
      ]);
      expect({ record: kycTool.get(id), file: caseFile(id) }).toEqual(before);
    }
  });

  it("opening a case writes nothing; the lookup runs only from the check_companies_house action", () => {
    const action = kycTool.actions.find((a) => a.name === "check_companies_house");
    expect(action?.fromStatus).toEqual(["pending_review", "info_requested", "escalated"]);
    const audit = () => db.select({ id: auditLog.id }).from(auditLog).all().length;
    const auditBefore = audit();
    const before = { record: kycTool.get("kyc_0104"), file: caseFile("kyc_0104") };
    const record = kycTool.get("kyc_0104");
    if (!record) throw new Error("kyc_0104 is not seeded");
    previewActions(kycTool, record, kycReviewer);
    caseFile("kyc_0104");
    kycTool.list({ filters: {}, limit: 1000, offset: 0 });
    expect({ record: kycTool.get("kyc_0104"), file: caseFile("kyc_0104") }).toEqual(before);
    expect(registry("kyc_0104")).toMatchObject({
      result: "clear",
      source: "Companies House",
      detail: "Checked by hand: active, directors match",
    });
    expect(audit()).toBe(auditBefore);

    const result = check("kyc_0104");
    expect(result.outcome.status).toBe("applied");
    const rows = db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.recordId, "kyc_0104"), eq(auditLog.action, "check_companies_house")))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe("applied");
    expect(kycTool.get("kyc_0104")?.version).toBe((before.record?.version ?? 0) + 1);
  });

  it("without COMPANIES_HOUSE_API_KEY the recorded response is used and labelled test data", () => {
    const transport = vi.fn();
    const result = lookupCompany("GB09318842", { env: {}, transport });
    expect(transport).not.toHaveBeenCalled();
    expect(result.testData).toBe(true);
    expect(result.source).toBe("Companies House (test data)");
    expect(result.detail).toMatch(/^Test data: /);
    expect(registry("kyc_0104")).toMatchObject({
      source: "Companies House (test data)",
      detail: expect.stringMatching(/^Test data: /),
    });
    for (const d of caseFile("kyc_0104").differences) {
      expect(d.source).toBe("Companies House (test data)");
    }
  });

  it("09318842 is late with its accounts and declared_vs_found holds approval for a manager", () => {
    expect(registry("kyc_0104")).toMatchObject({
      result: "findings",
      detail: "Test data: Active, accounts late (due 2026-06-30)",
    });
    expect(caseFile("kyc_0104").differences).toEqual([
      expect.objectContaining({
        topic: "Company accounts",
        declared: "Filed on time",
        found: "Late: due 2026-06-30",
        severity: "material",
      }),
    ]);
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(1);
    const held = expectHeldByDeclaredVsFound("kyc_0104", 1);
    if (held.outcome.status !== "pending_approval") throw new Error("expected a hold");
    expect(approve(kycManager, held.outcome.approvalId, "Accounts chased").outcome.status).toBe(
      "applied",
    );
    expect(kycTool.get("kyc_0104")?.status).toBe("approved");
  });

  it("an active company with its accounts up to date clears and approves straight through", () => {
    makeCase("kyc_ch_active", "GB08123456");
    expect(check("kyc_ch_active").outcome.status).toBe("applied");
    expect(registry("kyc_ch_active")).toMatchObject({
      result: "clear",
      detail: "Test data: Active, accounts up to date",
    });
    expect(caseFile("kyc_ch_active").differences).toEqual([]);
    const result = act(kycReviewer, "approve", "kyc_ch_active");
    expect(result.outcome.status).toBe("applied");
    expect(traceOf(result.outcome).every((o) => o.type === "allow")).toBe(true);
  });

  it("a dissolved company is a material difference", () => {
    makeCase("kyc_ch_dissolved", "GB07654321");
    expect(check("kyc_ch_dissolved").outcome.status).toBe("applied");
    expect(registry("kyc_ch_dissolved")).toMatchObject({
      result: "failed",
      detail: "Test data: Dissolved, accounts up to date",
    });
    expect(material("kyc_ch_dissolved")).toEqual([
      expect.objectContaining({
        topic: "Company status",
        declared: "Active",
        found: "Dissolved on 2025-11-04",
      }),
    ]);
    expectHeldByDeclaredVsFound("kyc_ch_dissolved", 1);
  });

  it("a company in liquidation is a material difference", () => {
    makeCase("kyc_ch_liquidation", "GB06543210");
    expect(check("kyc_ch_liquidation").outcome.status).toBe("applied");
    expect(registry("kyc_ch_liquidation")).toMatchObject({ result: "failed" });
    expect(material("kyc_ch_liquidation")).toEqual([
      expect.objectContaining({ topic: "Company status", declared: "Active", found: "In liquidation" }),
    ]);
    expectHeldByDeclaredVsFound("kyc_ch_liquidation", 1);
  });

  it("an unknown number shows couldn't check and holds approval", () => {
    expect(recordedAnswer("01010101")).toMatchObject({ kind: "response", status: 404 });
    makeCase("kyc_ch_unknown", "GB01010101");
    expectCouldNotCheck("kyc_ch_unknown", "no company with that number");
    makeCase("kyc_ch_malformed", "GB12");
    expectCouldNotCheck("kyc_ch_malformed", "not a Companies House number");
  });

  it("an API error shows couldn't check and holds approval", () => {
    makeCase("kyc_ch_error", "GB05000500");
    expectCouldNotCheck("kyc_ch_error", "Companies House answered HTTP 500");
    const unauthorised = lookupCompany("GB08123456", {
      env: { COMPANIES_HOUSE_API_KEY: "wrong-key" },
      transport: () => ({ kind: "response", status: 401, body: { error: "Invalid Authorization" } }),
    });
    expect(unauthorised).toMatchObject({
      result: "needs_review",
      detail: "Couldn't check: Companies House refused the API key",
    });
  });

  it("a timeout shows couldn't check and holds approval", () => {
    makeCase("kyc_ch_timeout", "GB05000408");
    expectCouldNotCheck("kyc_ch_timeout", "Companies House did not answer in time");
  });

  it("with COMPANIES_HOUSE_API_KEY the lookup sends the key by Basic auth and the result is not test data", () => {
    const requests: CompaniesHouseRequest[] = [];
    const result = lookupCompany("GB09318842", {
      env: { COMPANIES_HOUSE_API_KEY: "my_api_key" },
      transport: (request) => {
        requests.push(request);
        return recordedAnswer("09318842");
      },
    });
    expect(requests).toEqual([
      {
        url: `${COMPANIES_HOUSE_API}/company/09318842`,
        authorization: "Basic bXlfYXBpX2tleTo=",
        timeoutMs: expect.any(Number),
      },
    ]);
    expect(basicAuthorization("my_api_key")).toBe("Basic bXlfYXBpX2tleTo=");
    expect(result).toMatchObject({
      testData: false,
      source: "Companies House",
      detail: "Active, accounts late (due 2026-06-30)",
      differences: [expect.objectContaining({ topic: "Company accounts", severity: "material" })],
    });
  });

  it("the live transport reports a refused connection as couldn't check", () => {
    process.env.COMPANIES_HOUSE_API_KEY = "ch-secret-key-for-tests";
    process.env.COMPANIES_HOUSE_API_BASE = "http://127.0.0.1:9";
    makeCase("kyc_ch_refused", "GB08123456");
    expect(check("kyc_ch_refused").outcome.status).toBe("applied");
    expect(registry("kyc_ch_refused")).toMatchObject({
      result: "needs_review",
      source: "Companies House",
      detail: "Couldn't check: Companies House could not be reached",
    });
    expectHeldByDeclaredVsFound("kyc_ch_refused", 1);
  });

  it("the API key never reaches the check, the register, the audit trail or the log", () => {
    const key = "ch-secret-key-for-tests";
    process.env.COMPANIES_HOUSE_API_KEY = key;
    process.env.COMPANIES_HOUSE_API_BASE = "http://127.0.0.1:9";
    const logged = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    makeCase("kyc_ch_secret", "GB08123456");
    expect(check("kyc_ch_secret").outcome.status).toBe("applied");
    const encoded = Buffer.from(`${key}:`).toString("base64");
    const stored = JSON.stringify([
      caseFile("kyc_ch_secret"),
      kycTool.get("kyc_ch_secret"),
      db.select().from(auditLog).where(eq(auditLog.recordId, "kyc_ch_secret")).all(),
    ]);
    expect(stored).not.toContain(key);
    expect(stored).not.toContain(encoded);
    for (const spy of logged) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(key);
    }
  });

  it("re-running the check replaces its own rows and approve gains no new rule", () => {
    makeCase("kyc_ch_rerun", "GB09318842");
    check("kyc_ch_rerun");
    check("kyc_ch_rerun");
    const file = caseFile("kyc_ch_rerun");
    expect(file.checks.filter((c) => c.kind === "company_registry")).toHaveLength(1);
    expect(file.differences).toHaveLength(1);
    expect(kycTool.get("kyc_ch_rerun")?.materialDifferences).toBe(1);
    const result = expectHeldByDeclaredVsFound("kyc_ch_rerun", 1);
    expect(traceOf(result.outcome).map((o) => o.rule)).toEqual([
      "documents_complete",
      "no_sanctions_hit",
      "country_permitted",
      "risk_tier_approval",
      "pep_approval",
      "declared_vs_found",
      "escalated_needs_manager",
    ]);
  });
});
