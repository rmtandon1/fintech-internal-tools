import { spawnSync } from "node:child_process";
import { z } from "zod";
import type { CheckResult } from "./case-file";
import { RECORDED_COMPANY_PROFILES } from "./companies-house-recorded";

/**
 * Companies House public data API: `GET /company/{company_number}` returns the
 * company profile. Authentication is HTTP Basic with the API key as the
 * username and an empty password.
 * https://developer.company-information.service.gov.uk/authentication
 * https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/companyprofile
 */
export const COMPANIES_HOUSE_API = "https://api.company-information.service.gov.uk";
export const COMPANIES_HOUSE_SOURCE = "Companies House";
export const COMPANIES_HOUSE_TEST_SOURCE = "Companies House (test data)";

const TIMEOUT_MS = 5000;

export interface CompaniesHouseRequest {
  url: string;
  /** `Authorization` header value; empty for recorded responses. */
  authorization: string;
  timeoutMs: number;
}

export type CompaniesHouseResponse = { status: number; body: string } | { error: string };

export type CompaniesHouseTransport = (req: CompaniesHouseRequest) => CompaniesHouseResponse;

const CompanyProfile = z.looseObject({
  company_number: z.string(),
  company_name: z.string().optional(),
  company_status: z.string().optional(),
  date_of_cessation: z.string().optional(),
  accounts: z
    .looseObject({
      overdue: z.boolean().optional(),
      next_due: z.string().optional(),
      next_accounts: z
        .looseObject({ due_on: z.string().optional(), overdue: z.boolean().optional() })
        .optional(),
    })
    .optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfile>;

export type CompanyLookup =
  | { kind: "found"; profile: CompanyProfile; testData: boolean }
  | { kind: "not_found"; testData: boolean }
  | { kind: "error"; reason: string; testData: boolean };

/** One material Declared vs found row the profile adds. */
export interface CompaniesHouseFinding {
  key: "status" | "accounts";
  topic: string;
  declared: string;
  found: string;
}

export interface CompaniesHouseResult {
  check: { result: CheckResult; source: string; detail: string };
  /** Replacement Companies House rows; null keeps the earlier ones (the lookup failed). */
  findings: CompaniesHouseFinding[] | null;
}

/** The registration number from a company registry document number, or null. */
export function registrationNumber(documentNumber: string): string | null {
  const n = documentNumber.trim().toUpperCase().replace(/^GB/, "");
  return /^[A-Z0-9]{8}$/.test(n) ? n : null;
}

/** Answers from the recorded profiles; unknown numbers are 404 as live. */
export const recordedTransport: CompaniesHouseTransport = ({ url }) => {
  const number = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
  const profile = RECORDED_COMPANY_PROFILES[number];
  return profile
    ? { status: 200, body: JSON.stringify(profile) }
    : {
        status: 404,
        body: JSON.stringify({
          errors: [{ error: "company-profile-not-found", type: "ch:service" }],
        }),
      };
};

/**
 * Governed actions run synchronously inside one transaction, so the live
 * request runs in a child Node process. The key travels in that process's
 * environment only, never in its arguments.
 */
const LIVE_SCRIPT = `
const [url, timeout] = process.argv.slice(1);
fetch(url, {
  headers: { Authorization: process.env.CH_AUTHORIZATION, Accept: "application/json" },
  signal: AbortSignal.timeout(Number(timeout)),
})
  .then(async (r) => process.stdout.write(JSON.stringify({ status: r.status, body: await r.text() })))
  .catch((e) => {
    const code = (e && e.cause && e.cause.code) || (e && e.name) || "request failed";
    process.stdout.write(JSON.stringify({ error: code === "TimeoutError" ? "timed out" : String(code) }));
  });
`;

const LiveOutput = z.union([
  z.object({ status: z.number(), body: z.string() }),
  z.object({ error: z.string() }),
]);

export const liveTransport: CompaniesHouseTransport = ({ url, authorization, timeoutMs }) => {
  const child = spawnSync(process.execPath, ["-e", LIVE_SCRIPT, url, String(timeoutMs)], {
    env: { NODE_ENV: process.env.NODE_ENV, CH_AUTHORIZATION: authorization },
    encoding: "utf8",
    timeout: timeoutMs + 2000,
  });
  if (child.error) return { error: "timed out" };
  try {
    const parsed = LiveOutput.safeParse(JSON.parse(child.stdout));
    return parsed.success ? parsed.data : { error: "unreadable response" };
  } catch {
    return { error: "unreadable response" };
  }
};

let transportOverride: CompaniesHouseTransport | null = null;

/** Replace the live transport (tests); null restores it. */
export function useCompaniesHouseTransport(transport: CompaniesHouseTransport | null): void {
  transportOverride = transport;
}

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

export interface LookupOptions {
  apiKey?: string;
  baseUrl?: string;
  transport?: CompaniesHouseTransport;
  timeoutMs?: number;
}

/** Look a company up by registration number: live with a key, recorded without. */
export function lookupCompany(number: string, options: LookupOptions = {}): CompanyLookup {
  const apiKey = options.apiKey?.trim() ?? "";
  const testData = apiKey === "";
  const transport = testData ? recordedTransport : (options.transport ?? liveTransport);
  const url = `${options.baseUrl ?? COMPANIES_HOUSE_API}/company/${encodeURIComponent(number)}`;
  const response = transport({
    url,
    authorization: testData ? "" : basicAuth(apiKey),
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
  });
  if ("error" in response) return { kind: "error", reason: response.error, testData };
  if (response.status === 404) return { kind: "not_found", testData };
  if (response.status === 401) {
    return { kind: "error", reason: "the API key was refused", testData };
  }
  if (response.status === 429) return { kind: "error", reason: "rate limited", testData };
  if (response.status !== 200) {
    return { kind: "error", reason: `HTTP ${response.status}`, testData };
  }
  try {
    const parsed = CompanyProfile.safeParse(JSON.parse(response.body));
    return parsed.success
      ? { kind: "found", profile: parsed.data, testData }
      : { kind: "error", reason: "unreadable response", testData };
  } catch {
    return { kind: "error", reason: "unreadable response", testData };
  }
}

/** Dissolved, in liquidation and late with its accounts, as register rows. */
export function findingsFor(profile: CompanyProfile): CompaniesHouseFinding[] {
  const out: CompaniesHouseFinding[] = [];
  if (profile.company_status === "dissolved") {
    out.push({
      key: "status",
      topic: "Company status",
      declared: "Active company",
      found: profile.date_of_cessation
        ? `Dissolved on ${profile.date_of_cessation}`
        : "Dissolved",
    });
  } else if (profile.company_status === "liquidation") {
    out.push({
      key: "status",
      topic: "Company status",
      declared: "Active company",
      found: "In liquidation",
    });
  }
  const accounts = profile.accounts;
  const overdue = accounts?.next_accounts?.overdue ?? accounts?.overdue ?? false;
  if (overdue) {
    const due = accounts?.next_accounts?.due_on ?? accounts?.next_due;
    out.push({
      key: "accounts",
      topic: "Annual accounts",
      declared: "Accounts up to date",
      found: due ? `Late with its accounts, due ${due}` : "Late with its accounts",
    });
  }
  return out;
}

/** The check row and register rows one lookup produces. */
export function companiesHouseResult(
  documentNumber: string,
  options: LookupOptions = {},
): CompaniesHouseResult {
  const testData = (options.apiKey?.trim() ?? "") === "";
  const source = testData ? COMPANIES_HOUSE_TEST_SOURCE : COMPANIES_HOUSE_SOURCE;
  const label = (detail: string) => (testData ? `Test data: ${detail}` : detail);
  const number = registrationNumber(documentNumber);
  if (!number) {
    return {
      check: {
        result: "needs_review",
        source,
        detail: label("Couldn't check: not a Companies House registration number"),
      },
      findings: null,
    };
  }
  const lookup = lookupCompany(number, {
    ...options,
    transport: options.transport ?? transportOverride ?? undefined,
  });
  if (lookup.kind === "not_found") {
    return {
      check: {
        result: "needs_review",
        source,
        detail: label("Couldn't check: no company with this number"),
      },
      findings: null,
    };
  }
  if (lookup.kind === "error") {
    return {
      check: { result: "needs_review", source, detail: label(`Couldn't check: ${lookup.reason}`) },
      findings: null,
    };
  }
  const findings = findingsFor(lookup.profile);
  return {
    check: findings.length
      ? {
          result: "findings",
          source,
          detail: label(findings.map((f) => f.found).join("; ")),
        }
      : { result: "clear", source, detail: label("Active, accounts up to date") },
    findings,
  };
}
