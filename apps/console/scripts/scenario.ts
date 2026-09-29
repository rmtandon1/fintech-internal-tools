import { inArray } from "drizzle-orm";
import { db } from "@console/db";
import { refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";

/**
 * Demo aid: inserts a named operational scenario as seed-grade local data.
 *
 *   pnpm db:scenario courier-outage
 *
 * courier-outage — a courier failure at Fernhill Home produces 60 genuine
 * `not_received` refund requests (rfnd_1001–rfnd_1060). Re-running inserts
 * nothing that already exists, and a scenario id held by some other merchant's
 * refund is reported as a collision.
 *
 * The summary reports how many of the inserted rows the live policy places in
 * the manager's queue; this script does not submit them.
 *
 * Refuses to run under NODE_ENV=production: this is seed-grade data for a
 * local database only.
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
  inManagerQueue: number;
  collisions: string[];
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

  const collisions: string[] = [];
  for (const r of db
    .select({ id: refunds.id, merchant: refunds.merchant })
    .from(refunds)
    .where(inArray(refunds.id, ids))
    .all()) {
    if (r.merchant !== COURIER_OUTAGE.merchant) collisions.push(r.id);
  }

  const managerQueue = refundTool.list({
    filters: { queue: "manager" },
    limit: 1000,
    offset: 0,
  });
  return {
    inserted,
    inManagerQueue: managerQueue.rows.filter(
      (record) => ids.includes(record.id) && record.merchant === COURIER_OUTAGE.merchant,
    ).length,
    collisions,
  };
}

function printSummary(name: ScenarioName, s: ScenarioSummary): void {
  console.log(`scenario ${name}`);
  console.log(`  inserted ${s.inserted} refund(s); ${s.inManagerQueue} are in the manager queue`);
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
  const summary = SCENARIOS[requested]();
  printSummary(requested, summary);
  if (summary.collisions.length) process.exit(1);
}

if (process.argv[1]?.endsWith("scenario.ts")) main();
