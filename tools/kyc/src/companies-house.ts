import { execFileSync } from "node:child_process";
import { z } from "zod";
import recordings from "./companies-house-recordings.json";
import { companyNumber } from "./monitoring";

/**
 * Companies House company profile lookups. The key is read on the server from
 * `COMPANIES_HOUSE_API_KEY`, handed only to the child process that makes the
 * request, and never returned, logged or stored. Without a key the recorded
 * responses answer instead and every result is labelled test data.
 */
export const COMPANIES_HOUSE_API_KEY_ENV = "COMPANIES_HOUSE_API_KEY";
export const COMPANIES_HOUSE_API = "https://api.company-information.service.gov.uk";
/** Upper bound on one lookup, request and reply included. */
export const LOOKUP_TIMEOUT_MS = 5_000;

const Reply = z.union([
  z.object({ timeout: z.literal(true) }),
  z.object({ status: z.number(), body: z.unknown() }),
]);

/** What the service answered, or that it did not answer in time. */
export type RecordedResponse = z.infer<typeof Reply>;

export interface CompaniesHouseTransport {
  /** True when answers come from recordings rather than the live service. */
  testData: boolean;
  get: (companyNumber: string) => RecordedResponse;
}

export type RegistryLookup =
  | {
      kind: "found";
      companyNumber: string;
      companyName: string;
      companyStatus: string;
      testData: boolean;
    }
  | { kind: "couldnt_check"; companyNumber: string; reason: string; testData: boolean };

const Recordings = z.object({
  companies: z.record(z.string(), Reply),
  failures: z.object({ error: Reply, timeout: Reply }),
});

const RECORDINGS = Recordings.parse(recordings);

/** Recorded failures, for replaying an error or a timeout in place of a company. */
export const RECORDED_FAILURES = RECORDINGS.failures;

const CompanyProfile = z.object({
  company_number: z.string(),
  company_name: z.string(),
  company_status: z.string(),
});

/** Replays recorded responses; a number with no recording gets no answer. */
export function recordedTransport(
  overrides: Record<string, RecordedResponse> = {},
): CompaniesHouseTransport {
  return {
    testData: true,
    get: (companyNumber) =>
      overrides[companyNumber] ?? RECORDINGS.companies[companyNumber] ?? { status: 404, body: null },
  };
}

/** Runs a program and returns its stdout; `execFileSync` outside tests. */
export type ProcessRunner = (
  file: string,
  args: string[],
  options: { env: Record<string, string>; timeout: number },
) => string;

const runProcess: ProcessRunner = (file, args, options) =>
  execFileSync(file, args, {
    env: { ...options.env, NODE_ENV: process.env.NODE_ENV },
    timeout: options.timeout,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

/**
 * One request, made in a child process so the synchronous governed write path
 * can wait on it. The key travels in the child's environment, not its
 * arguments, and the child is killed at the timeout.
 */
const LOOKUP_SCRIPT = `
const url = process.argv[1];
const auth = "Basic " + Buffer.from(process.env.${COMPANIES_HOUSE_API_KEY_ENV} + ":").toString("base64");
fetch(url, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(${LOOKUP_TIMEOUT_MS - 500}) })
  .then(async (res) => {
    let body = null;
    try { body = await res.json(); } catch {}
    process.stdout.write(JSON.stringify({ status: res.status, body }));
  })
  .catch((err) => {
    process.stdout.write(JSON.stringify(err && err.name === "TimeoutError" ? { timeout: true } : { status: 0, body: null }));
  });
`;

export function liveTransport(apiKey: string, run: ProcessRunner = runProcess): CompaniesHouseTransport {
  return {
    testData: false,
    get: (companyNumber) => {
      const url = `${COMPANIES_HOUSE_API}/company/${encodeURIComponent(companyNumber)}`;
      try {
        const out = run(process.execPath, ["-e", LOOKUP_SCRIPT, url], {
          env: { [COMPANIES_HOUSE_API_KEY_ENV]: apiKey },
          timeout: LOOKUP_TIMEOUT_MS,
        });
        const reply = Reply.safeParse(JSON.parse(out));
        return reply.success ? reply.data : { status: 0, body: null };
      } catch {
        // The runner throws when the child is killed at the timeout.
        return { timeout: true };
      }
    },
  };
}

let override: CompaniesHouseTransport | null = null;

/** Replaces the transport, for tests; null goes back to the key or the recordings. */
export function useCompaniesHouseTransport(transport: CompaniesHouseTransport | null): void {
  override = transport;
}

/** Live with a key on the server, recordings without one. */
export function companiesHouseTransport(
  env: Readonly<Partial<Record<string, string>>> = process.env,
): CompaniesHouseTransport {
  if (override) return override;
  const key = env[COMPANIES_HOUSE_API_KEY_ENV]?.trim();
  return key ? liveTransport(key) : recordedTransport();
}

/**
 * The registered company number in a KYC document number: `GB00365335` and
 * `00365335` both give `00365335`. Null when it cannot be one.
 */
export function companyNumberOf(documentNumber: string): string | null {
  const raw = companyNumber(documentNumber.trim().toUpperCase());
  return /^[A-Z0-9]{8}$/.test(raw) ? raw : null;
}

/** One lookup. Anything but a readable profile is "couldn't check", with why. */
export function lookupCompany(
  transport: CompaniesHouseTransport,
  documentNumber: string,
): RegistryLookup {
  const testData = transport.testData;
  const companyNumber = companyNumberOf(documentNumber);
  if (!companyNumber) {
    return { kind: "couldnt_check", companyNumber: "", reason: "not a company number", testData };
  }
  const reply = transport.get(companyNumber);
  if ("timeout" in reply) return { kind: "couldnt_check", companyNumber, reason: "timed out", testData };
  if (reply.status === 404) return { kind: "couldnt_check", companyNumber, reason: "not found", testData };
  const profile = reply.status === 200 ? CompanyProfile.safeParse(reply.body) : null;
  if (!profile?.success) {
    return {
      kind: "couldnt_check",
      companyNumber,
      reason: reply.status === 0 ? "no answer" : `error ${reply.status}`,
      testData,
    };
  }
  return {
    kind: "found",
    companyNumber,
    companyName: profile.data.company_name,
    companyStatus: profile.data.company_status,
    testData,
  };
}
