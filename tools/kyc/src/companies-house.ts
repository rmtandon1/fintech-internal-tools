import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { CheckResult, DifferenceSeverity } from "./case-file";
import { RECORDED_RESPONSES } from "./companies-house-recorded";

/**
 * Companies House company profile lookup for UK business cases.
 *
 * With `COMPANIES_HOUSE_API_KEY` set on the server, the check calls
 * `GET {COMPANIES_HOUSE_API_BASE}/company/{companyNumber}` with the key as the
 * HTTP Basic username and a blank password. Without it, recorded responses
 * answer and the result is labelled test data. The key is read here only; it
 * never reaches a result, a log line or the browser.
 */

export const COMPANIES_HOUSE_API = "https://api.company-information.service.gov.uk";
export const LOOKUP_TIMEOUT_MS = 5_000;

export type CompaniesHouseAnswer =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "timeout" }
  | { kind: "error" };

export interface CompaniesHouseRequest {
  url: string;
  authorization: string;
  timeoutMs: number;
}

export type CompaniesHouseTransport = (request: CompaniesHouseRequest) => CompaniesHouseAnswer;

export interface CompanyFinding {
  topic: string;
  declared: string;
  found: string;
  severity: DifferenceSeverity;
}

export interface CompaniesHouseCheck {
  result: CheckResult;
  source: string;
  detail: string;
  testData: boolean;
  differences: CompanyFinding[];
}

export interface LookupOptions {
  env?: Record<string, string | undefined>;
  transport?: CompaniesHouseTransport;
}

const CompanyProfile = z.object({
  company_status: z.string().optional(),
  date_of_cessation: z.string().optional(),
  accounts: z
    .object({
      overdue: z.boolean().optional(),
      next_due: z.string().optional(),
      next_accounts: z
        .object({ overdue: z.boolean().optional(), due_on: z.string().optional() })
        .optional(),
    })
    .optional(),
});

/** `company_status` descriptions from the API's enumeration mappings. */
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  dissolved: "Dissolved",
  liquidation: "In liquidation",
  receivership: "Receiver action",
  "converted-closed": "Converted / closed",
  "voluntary-arrangement": "Voluntary arrangement",
  "insolvency-proceedings": "Insolvency proceedings",
  administration: "In administration",
  open: "Open",
  closed: "Closed",
  registered: "Registered",
  removed: "Removed",
};

const COMPANY_NUMBER = /^[A-Z0-9]{8}$/;

/** The Companies House number in a `company_registry` document number, e.g. `GB09318842`. */
export function registrationNumber(documentNumber: string): string | null {
  const number = documentNumber.trim().toUpperCase().replace(/^GB/, "");
  return COMPANY_NUMBER.test(number) ? number : null;
}

export function basicAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

/** Looks the company up and turns the answer into a check and its register rows. */
export function lookupCompany(documentNumber: string, options: LookupOptions = {}): CompaniesHouseCheck {
  const env = options.env ?? process.env;
  const apiKey = env.COMPANIES_HOUSE_API_KEY;
  const testData = !apiKey;
  const number = registrationNumber(documentNumber);
  if (!number) return couldNotCheck(testData, "not a Companies House number");
  if (!apiKey) return interpret(recordedAnswer(number), true);
  const base = env.COMPANIES_HOUSE_API_BASE || COMPANIES_HOUSE_API;
  const answer = (options.transport ?? liveTransport)({
    url: `${base.replace(/\/+$/, "")}/company/${encodeURIComponent(number)}`,
    authorization: basicAuthorization(apiKey),
    timeoutMs: LOOKUP_TIMEOUT_MS,
  });
  return interpret(answer, false);
}

export function recordedAnswer(number: string): CompaniesHouseAnswer {
  return (
    RECORDED_RESPONSES[number] ?? {
      kind: "response",
      status: 404,
      body: { errors: [{ error: "company-profile-not-found", type: "ch:service" }] },
    }
  );
}

/**
 * Governed writes are synchronous, so the request runs in a child Node process
 * and the action waits for it. The child gets only NODE_ENV, the URL, the
 * header and the timeout in its environment, and its stderr is discarded.
 */
const FETCH_SCRIPT = `
try {
  const res = await fetch(process.env.CH_URL, {
    headers: { Authorization: process.env.CH_AUTHORIZATION, Accept: "application/json" },
    signal: AbortSignal.timeout(Number(process.env.CH_TIMEOUT_MS)),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  process.stdout.write(JSON.stringify({ status: res.status, body }));
} catch (error) {
  process.stdout.write(JSON.stringify({ failure: error && error.name === "TimeoutError" ? "timeout" : "error" }));
}
`;

const ChildAnswer = z.union([
  z.object({ status: z.number().int(), body: z.unknown() }),
  z.object({ failure: z.enum(["timeout", "error"]) }),
]);

export const liveTransport: CompaniesHouseTransport = ({ url, authorization, timeoutMs }) => {
  try {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", FETCH_SCRIPT], {
      env: {
        NODE_ENV: process.env.NODE_ENV,
        CH_URL: url,
        CH_AUTHORIZATION: authorization,
        CH_TIMEOUT_MS: String(timeoutMs),
      },
      timeout: timeoutMs + 2_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1024 * 1024,
    });
    const parsed = ChildAnswer.safeParse(JSON.parse(out));
    if (!parsed.success) return { kind: "error" };
    if ("failure" in parsed.data) return { kind: parsed.data.failure };
    return { kind: "response", status: parsed.data.status, body: parsed.data.body };
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ETIMEDOUT"
      ? { kind: "timeout" }
      : { kind: "error" };
  }
};

function sourceFor(testData: boolean): string {
  return testData ? "Companies House (test data)" : "Companies House";
}

function label(testData: boolean, text: string): string {
  return testData ? `Test data: ${text}` : text;
}

function couldNotCheck(testData: boolean, why: string): CompaniesHouseCheck {
  const found = `Couldn't check: ${why}`;
  return {
    result: "needs_review",
    source: sourceFor(testData),
    detail: label(testData, found),
    testData,
    differences: [
      { topic: "Company registry", declared: "Registered with Companies House", found, severity: "material" },
    ],
  };
}

function failureReason(answer: CompaniesHouseAnswer): string | null {
  if (answer.kind === "timeout") return "Companies House did not answer in time";
  if (answer.kind === "error") return "Companies House could not be reached";
  if (answer.status === 200) return null;
  if (answer.status === 404) return "no company with that number";
  if (answer.status === 401) return "Companies House refused the API key";
  if (answer.status === 429) return "Companies House rate limit reached";
  return `Companies House answered HTTP ${answer.status}`;
}

export function interpret(answer: CompaniesHouseAnswer, testData: boolean): CompaniesHouseCheck {
  const why = failureReason(answer);
  if (why !== null || answer.kind !== "response") {
    return couldNotCheck(testData, why ?? "Companies House could not be reached");
  }
  const profile = CompanyProfile.safeParse(answer.body);
  if (!profile.success) return couldNotCheck(testData, "Companies House sent an unreadable answer");

  const { company_status: status = "unknown", date_of_cessation: ceased, accounts } = profile.data;
  const statusLabel = STATUS_LABEL[status] ?? status;
  const differences: CompanyFinding[] = [];
  if (status === "dissolved") {
    differences.push({
      topic: "Company status",
      declared: "Active",
      found: ceased ? `Dissolved on ${ceased}` : "Dissolved",
      severity: "material",
    });
  } else if (status === "liquidation") {
    differences.push({ topic: "Company status", declared: "Active", found: "In liquidation", severity: "material" });
  } else if (status !== "active") {
    differences.push({ topic: "Company status", declared: "Active", found: statusLabel, severity: "minor" });
  }

  const overdue = accounts?.next_accounts?.overdue ?? accounts?.overdue ?? false;
  const dueOn = accounts?.next_accounts?.due_on ?? accounts?.next_due;
  if (overdue) {
    differences.push({
      topic: "Company accounts",
      declared: "Filed on time",
      found: dueOn ? `Late: due ${dueOn}` : "Late",
      severity: "material",
    });
  }

  const closed = status === "dissolved" || status === "liquidation";
  const result: CheckResult = closed ? "failed" : differences.length > 0 ? "findings" : "clear";
  const accountsText = overdue
    ? `accounts late${dueOn ? ` (due ${dueOn})` : ""}`
    : "accounts up to date";
  return {
    result,
    source: sourceFor(testData),
    detail: label(testData, `${statusLabel}, ${accountsText}`),
    testData,
    differences,
  };
}
