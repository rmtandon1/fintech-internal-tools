import { and, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@console/db";
import { auditLog } from "@console/db-core/engine-schema";
import { DEMO_ACTORS } from "@console/engine/actor";
import { executeIntent } from "@console/engine/execute-intent";
import { configureEngine } from "@console/engine/registry";
import { refunds } from "@console/tool-refunds/schema";
import { toolRegistry } from "@/registry";

/**
 * Demo aid: loads a named operational scenario and drives it through the real
 * engine, so whatever lands in the inbox or the audit log got there the same
 * way a live request would. Nothing here writes an approval or audit row.
 *
 *   pnpm db:scenario courier-outage
 *
 * courier-outage — a courier failure at Fernhill Home produces 60 genuine
 * `not_received` refund requests (rfnd_1001–rfnd_1060), which are then
 * submitted one by one as the demo refunds agent. Re-running inserts nothing
 * that already exists and resubmits nothing the engine has already seen: any
 * refund with an `execute` audit row (applied, denied or awaiting approval) is
 * skipped, and a scenario id held by some other merchant's refund is reported
 * as a collision rather than submitted.
 *
 * Today every one of these refunds applies: each sits under the manager
 * threshold and no rule looks across requests. Once the clustering hold merges
 * most of them will be sent to the manager inbox instead, and the summary this
 * script prints will show that shift.
 *
 * Refuses to run under NODE_ENV=production, like db:tamper: this is seed-grade
 * data for a local database only.
 */
if (process.env.NODE_ENV === "production") {
  console.error("db:scenario is a local demo aid and refuses to run in production");
  process.exit(1);
}

const SCENARIOS = {
  "courier-outage": courierOutage,
} as const;
type ScenarioName = keyof typeof SCENARIOS;

const HOUR = 60 * 60 * 1000;

/** Static rates, same table as tools/refunds/src/seed.ts. */
const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  SEK: 0.095,
  JPY: 0.0067,
};

function usdMinor(minor: number, currency: string): number {
  return Math.round(minor * (USD_PER_UNIT[currency] ?? 1));
}

const COURIER_OUTAGE = {
  merchant: "Fernhill Home",
  count: 60,
  firstId: 1001,
  minMinor: 3_000,
  maxMinor: 45_000,
  windowHours: 48,
} as const;

/**
 * Amounts walk the 3,000–45,000 range in equal steps and request times walk
 * back through the last 48 hours, so the same run always produces the same
 * rows. Emails and card last-4s are derived from the index and never repeat.
 */
function courierOutageRows(now: number) {
  const { count, firstId, minMinor, maxMinor, windowHours } = COURIER_OUTAGE;
  const step = (maxMinor - minMinor) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const seq = firstId + i;
    const amountMinor = Math.round(minMinor + step * i);
    const currency = "USD";
    return {
      id: `rfnd_${seq}`,
      paymentId: `pay_fh${String(seq).padStart(6, "0")}`,
      customerEmail: `fernhill.customer${String(i + 1).padStart(2, "0")}@example.com`,
      cardLast4: String(1000 + ((i * 137) % 9000)).padStart(4, "0"),
      merchant: COURIER_OUTAGE.merchant,
      psp: "stripe",
      currency,
      capturedMinor: amountMinor,
      refundedMinor: 0,
      amountMinor,
      usdMinor: usdMinor(amountMinor, currency),
      reasonCode: "not_received",
      disputed: 0,
      status: "requested",
      requestedBy: null,
      // Newest request 1h ago, oldest just inside the window.
      requestedAt: now - Math.round(HOUR + (i * (windowHours - 2) * HOUR) / (count - 1)),
      settledAt: null,
      lastNote: "Courier reported the consignment lost in transit.",
      version: 1,
    };
  });
}

export interface ScenarioSummary {
  inserted: number;
  submitted: number;
  skipped: number;
  applied: number;
  pendingApproval: number;
  denied: number;
  errors: number;
  collisions: string[];
  firstDenialReason: string | null;
}

export function courierOutage(now = Date.now()): ScenarioSummary {
  const rows = courierOutageRows(now);
  const ids = rows.map((r) => r.id);

  const existing = new Set(
    db
      .select({ id: refunds.id })
      .from(refunds)
      .where(inArray(refunds.id, ids))
      .all()
      .map((r) => r.id),
  );
  let inserted = 0;
  for (const row of rows) {
    if (existing.has(row.id)) continue;
    db.insert(refunds).values(row).onConflictDoNothing().run();
    inserted++;
  }

  const alreadySubmitted = new Set(
    db
      .select({ recordId: auditLog.recordId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tool, "refunds"),
          eq(auditLog.action, "execute"),
          inArray(auditLog.recordId, ids),
        ),
      )
      .all()
      .map((r) => r.recordId),
  );
  const collisions: string[] = [];
  const stillRequested: string[] = [];
  for (const r of db
    .select({ id: refunds.id, merchant: refunds.merchant, status: refunds.status })
    .from(refunds)
    .where(inArray(refunds.id, ids))
    .all()) {
    if (r.merchant !== COURIER_OUTAGE.merchant) collisions.push(r.id);
    else if (r.status === "requested" && !alreadySubmitted.has(r.id)) stillRequested.push(r.id);
  }

  const summary: ScenarioSummary = {
    inserted,
    submitted: 0,
    skipped: ids.length - stillRequested.length - collisions.length,
    applied: 0,
    pendingApproval: 0,
    denied: 0,
    errors: 0,
    collisions,
    firstDenialReason: null,
  };

  const agent = DEMO_ACTORS.refunds_agent;
  for (const id of stillRequested) {
    const { outcome } = executeIntent(agent, {
      tool: "refunds",
      action: "execute",
      recordId: id,
      input: {},
      idempotencyKey: ulid(),
    });
    summary.submitted++;
    if (outcome.status === "applied") summary.applied++;
    else if (outcome.status === "pending_approval") summary.pendingApproval++;
    else if (outcome.status === "denied") {
      summary.denied++;
      summary.firstDenialReason ??= outcome.reason;
    } else summary.errors++;
  }
  return summary;
}

function printSummary(name: ScenarioName, s: ScenarioSummary): void {
  console.log(`scenario ${name}`);
  console.log(`  inserted ${s.inserted} refund(s), submitted ${s.submitted}, skipped ${s.skipped} already moved`);
  console.log(`  applied ${s.applied} / sent to approval ${s.pendingApproval} / denied ${s.denied}`);
  if (s.errors) console.log(`  errors ${s.errors}`);
  if (s.firstDenialReason) console.log(`  first denial: ${s.firstDenialReason}`);
  if (s.collisions.length) {
    console.error(
      `  ${s.collisions.length} id(s) belong to another merchant's refund and were left alone: ${s.collisions.join(", ")}`,
    );
  }
}

function isScenarioName(name: string): name is ScenarioName {
  return Object.hasOwn(SCENARIOS, name);
}

function main(): void {
  const requested = process.argv[2];
  if (!requested || !isScenarioName(requested)) {
    console.error(
      `${requested ? `unknown scenario "${requested}"` : "missing scenario"} — expected one of ${Object.keys(SCENARIOS).join(", ")}`,
    );
    process.exit(1);
  }
  configureEngine({ tools: toolRegistry });
  const summary = SCENARIOS[requested]();
  printSummary(requested, summary);
  if (summary.errors || summary.collisions.length) process.exit(1);
}

if (process.argv[1]?.endsWith("scenario.ts")) main();
