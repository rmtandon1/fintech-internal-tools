import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { auditLog } from "@console/db-core/engine-schema";
import { executeIntent } from "@console/engine/execute-intent";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { Actor } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import {
  COMPANIES_HOUSE_API,
  COMPANIES_HOUSE_CHECK_KEY,
  COMPANIES_HOUSE_SOURCE,
  COMPANIES_HOUSE_TEST_SOURCE,
  caseFile,
  kycTool,
  liveTransport,
  lookupCompany,
  useCompaniesHouseTransport,
  type CompaniesHouseRequest,
  type CompaniesHouseTransport,
} from "@console/tool-kyc";
import { kycCases } from "@console/tool-kyc/schema";
import { admin, analyst, setupHarness } from "../helpers/harness";

const API_KEY = "ch-test-key-4f1c9e";

beforeAll(() => {
  setupHarness();
  registerConstants(kycTool.constants ?? []);
  kycTool.seed?.();
  // Two UK business cases whose recorded profiles are dissolved and in liquidation.
  const base = db.select().from(kycCases).where(eq(kycCases.id, "kyc_0104")).get();
  if (!base) throw new Error("kyc_0104 not seeded");
  for (const [id, name, number] of [
    ["kyc_ch_dissolved", "Elmstead Print Works Limited", "GB07261930"],
    ["kyc_ch_liquidation", "Quayside Logistics Ltd", "GB11456078"],
    ["kyc_ch_unknown", "Nowhere Trading Ltd", "GB99999999"],
  ] as const) {
    db.insert(kycCases)
      .values({ ...base, id, customerName: name, documentNumber: number })
      .run();
  }
});

afterEach(() => {
  delete process.env.COMPANIES_HOUSE_API_KEY;
  useCompaniesHouseTransport(null);
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

function registry(id: string) {
  return caseFile(id).checks.find((c) => c.kind === "company_registry");
}

function companiesHouseRows(id: string) {
  return caseFile(id).differences.filter((d) => d.id.startsWith(`${id}_companies_house_`));
}

function turnOn(): void {
  expect(setConstant(admin, COMPANIES_HOUSE_CHECK_KEY, "1").ok).toBe(true);
}

function profile(overrides: Record<string, unknown>): string {
  return JSON.stringify({ company_number: "09318842", company_status: "active", ...overrides });
}

describe("Companies House check", () => {
  it("with kyc.companies_house_check off, checking Companies House is denied and the case is unchanged", () => {
    const before = { record: kycTool.get("kyc_0104"), file: caseFile("kyc_0104") };
    const result = act(analyst, "check_companies_house", "kyc_0104");
    expect(result.outcome).toMatchObject({ status: "denied" });
    if (result.outcome.status !== "denied") throw new Error("expected denial");
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({ rule: "companies_house_check_on", type: "deny" }),
    );
    expect(kycTool.get("kyc_0104")).toEqual(before.record);
    expect(caseFile("kyc_0104")).toEqual(before.file);
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(0);
  });

  it("only UK business cases are checked; consumer and non-UK cases are denied", () => {
    turnOn();
    for (const id of ["kyc_0102", "kyc_0011"]) {
      const before = caseFile(id);
      const result = act(analyst, "check_companies_house", id);
      if (result.outcome.status !== "denied") {
        throw new Error(`${id}: expected denial, got ${result.outcome.status}`);
      }
      expect(result.outcome.trace).toContainEqual(
        expect.objectContaining({ rule: "uk_business_case", type: "deny" }),
      );
      expect(caseFile(id)).toEqual(before);
    }
  });

  it("without COMPANIES_HOUSE_API_KEY the recorded response is used and labelled test data", () => {
    turnOn();
    const lookup = lookupCompany("09318842");
    expect(lookup).toMatchObject({ kind: "found", testData: true });
    expect(act(analyst, "check_companies_house", "kyc_0104").outcome.status).toBe("applied");
    const check = registry("kyc_0104");
    expect(check?.source).toBe(COMPANIES_HOUSE_TEST_SOURCE);
    expect(check?.detail).toMatch(/^Test data: /);
    for (const row of companiesHouseRows("kyc_0104")) {
      expect(row.source).toBe(COMPANIES_HOUSE_TEST_SOURCE);
    }
  });

  it("09318842 is late with its accounts and declared_vs_found holds approval for a manager", () => {
    turnOn();
    act(analyst, "check_companies_house", "kyc_0104");
    expect(registry("kyc_0104")).toMatchObject({
      result: "findings",
      detail: "Test data: Late with its accounts, due 2025-06-30",
    });
    expect(companiesHouseRows("kyc_0104")).toEqual([
      expect.objectContaining({
        topic: "Annual accounts",
        declared: "Accounts up to date",
        found: "Late with its accounts, due 2025-06-30",
        severity: "material",
      }),
    ]);
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(1);

    const result = act(analyst, "approve", "kyc_0104");
    if (result.outcome.status !== "pending_approval") {
      throw new Error(`expected approval, got ${result.outcome.status}`);
    }
    expect(result.outcome.trace).toContainEqual(
      expect.objectContaining({
        rule: "declared_vs_found",
        type: "require_approval",
        tier: "manager",
        allowedRoles: rolesFor("kyc", "manager"),
        reason: "1 material difference between what the customer declared and what the checks found",
      }),
    );
    expect(kycTool.get("kyc_0104")?.status).toBe("pending_review");
  });

  it("an active company with its accounts up to date clears the registry check and adds no row", () => {
    turnOn();
    const material = kycTool.get("kyc_0003")?.materialDifferences;
    expect(act(analyst, "check_companies_house", "kyc_0003").outcome.status).toBe("applied");
    expect(registry("kyc_0003")).toMatchObject({
      result: "clear",
      source: COMPANIES_HOUSE_TEST_SOURCE,
      detail: "Test data: Active, accounts up to date",
    });
    expect(companiesHouseRows("kyc_0003")).toEqual([]);
    expect(kycTool.get("kyc_0003")?.materialDifferences).toBe(material);
  });

  it("a dissolved company adds a material Declared vs found row", () => {
    turnOn();
    expect(act(analyst, "check_companies_house", "kyc_ch_dissolved").outcome.status).toBe(
      "applied",
    );
    expect(companiesHouseRows("kyc_ch_dissolved")).toEqual([
      expect.objectContaining({
        topic: "Company status",
        declared: "Active company",
        found: "Dissolved on 2025-11-04",
        severity: "material",
      }),
    ]);
    expect(registry("kyc_ch_dissolved")?.result).toBe("findings");
    expect(kycTool.get("kyc_ch_dissolved")?.materialDifferences).toBe(1);
    expect(act(analyst, "approve", "kyc_ch_dissolved").outcome.status).toBe("pending_approval");
  });

  it("a company in liquidation adds a material Declared vs found row", () => {
    turnOn();
    act(analyst, "check_companies_house", "kyc_ch_liquidation");
    expect(companiesHouseRows("kyc_ch_liquidation")).toEqual([
      expect.objectContaining({
        topic: "Company status",
        found: "In liquidation",
        severity: "material",
      }),
    ]);
    expect(kycTool.get("kyc_ch_liquidation")?.materialDifferences).toBe(1);
    expect(act(analyst, "approve", "kyc_ch_liquidation").outcome.status).toBe(
      "pending_approval",
    );
  });

  it("a failed lookup marks the registry check needs review and keeps earlier findings", () => {
    turnOn();
    act(analyst, "check_companies_house", "kyc_0104");
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(1);

    process.env.COMPANIES_HOUSE_API_KEY = API_KEY;
    useCompaniesHouseTransport(() => ({ error: "timed out" }));
    expect(act(analyst, "check_companies_house", "kyc_0104").outcome.status).toBe("applied");
    expect(registry("kyc_0104")).toMatchObject({
      result: "needs_review",
      source: COMPANIES_HOUSE_SOURCE,
      detail: "Couldn't check: timed out",
    });
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(1);

    useCompaniesHouseTransport(null);
    delete process.env.COMPANIES_HOUSE_API_KEY;
    act(analyst, "check_companies_house", "kyc_ch_unknown");
    expect(registry("kyc_ch_unknown")).toMatchObject({
      result: "needs_review",
      detail: "Test data: Couldn't check: no company with this number",
    });
    expect(companiesHouseRows("kyc_ch_unknown")).toEqual([]);
  });

  it("with COMPANIES_HOUSE_API_KEY the lookup sends the key by Basic auth to the company profile and is not test data", () => {
    const seen: CompaniesHouseRequest[] = [];
    const transport: CompaniesHouseTransport = (req) => {
      seen.push(req);
      return { status: 200, body: profile({ company_status: "liquidation" }) };
    };
    const lookup = lookupCompany("09318842", { apiKey: API_KEY, transport });
    expect(lookup).toMatchObject({ kind: "found", testData: false });
    expect(seen).toEqual([
      expect.objectContaining({
        url: `${COMPANIES_HOUSE_API}/company/09318842`,
        authorization: `Basic ${Buffer.from(`${API_KEY}:`).toString("base64")}`,
      }),
    ]);
    expect(lookupCompany("09318842", { apiKey: API_KEY, transport: () => ({ status: 404, body: "{}" }) }))
      .toMatchObject({ kind: "not_found", testData: false });
    expect(lookupCompany("09318842", { apiKey: API_KEY, transport: () => ({ status: 401, body: "" }) }))
      .toMatchObject({ kind: "error", reason: "the API key was refused" });
  });

  it("the live transport reports a refused connection as couldn't check", () => {
    const lookup = lookupCompany("09318842", {
      apiKey: API_KEY,
      baseUrl: "http://127.0.0.1:9",
      transport: liveTransport,
      timeoutMs: 3000,
    });
    expect(lookup.kind).toBe("error");
    expect(JSON.stringify(lookup)).not.toContain(API_KEY);
  });

  it("the API key never reaches the case file or the audit trail", () => {
    turnOn();
    process.env.COMPANIES_HOUSE_API_KEY = API_KEY;
    useCompaniesHouseTransport(() => ({
      status: 200,
      body: profile({ company_number: "11456078", company_status: "liquidation" }),
    }));
    expect(act(analyst, "check_companies_house", "kyc_ch_liquidation").outcome.status).toBe(
      "applied",
    );
    expect(registry("kyc_ch_liquidation")).toMatchObject({
      source: COMPANIES_HOUSE_SOURCE,
      detail: "In liquidation",
    });
    const audit = db.select().from(auditLog).where(eq(auditLog.recordId, "kyc_ch_liquidation")).all();
    expect(audit.length).toBeGreaterThan(0);
    const encoded = Buffer.from(`${API_KEY}:`).toString("base64");
    for (const text of [JSON.stringify(caseFile("kyc_ch_liquidation")), JSON.stringify(audit)]) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(encoded);
    }
  });

  it("re-running the check replaces its own rows and approve gains no new rule", () => {
    turnOn();
    act(analyst, "check_companies_house", "kyc_0104");
    act(analyst, "check_companies_house", "kyc_0104");
    expect(companiesHouseRows("kyc_0104")).toHaveLength(1);
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(1);

    process.env.COMPANIES_HOUSE_API_KEY = API_KEY;
    useCompaniesHouseTransport(() => ({ status: 200, body: profile({}) }));
    act(analyst, "check_companies_house", "kyc_0104");
    expect(companiesHouseRows("kyc_0104")).toEqual([]);
    expect(kycTool.get("kyc_0104")?.materialDifferences).toBe(0);

    const approveAction = kycTool.actions.find((a) => a.name === "approve");
    expect(approveAction?.rules).toHaveLength(7);
  });
});
