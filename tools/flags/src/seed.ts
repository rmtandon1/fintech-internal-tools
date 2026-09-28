import { notInArray } from "drizzle-orm";
import { db } from "@console/db";
import { featureFlags } from "./schema";

const DAY = 24 * 60 * 60 * 1000;

interface SeedFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  flagType: string;
  environment: string;
  owner: string;
  rolloutPercent: number;
  customerFacing: boolean;
  expiresInDays: number | null;
  lastNote?: string;
}

/**
 * A working flag set: release flags mid-rollout, ops switches, kill switches,
 * experiments, permission flags, and one flag past its review date.
 */
const FLAGS: SeedFlag[] = [
  {
    id: "flag_0001",
    key: "payments.instant_payouts",
    name: "Instant payouts",
    description: "Settle merchant payouts within the hour instead of T+1.",
    flagType: "release",
    environment: "production",
    owner: "payments",
    rolloutPercent: 25,
    customerFacing: true,
    expiresInDays: 30,
    lastNote: "Quarter of merchants enrolled; watching funding balance.",
  },
  {
    id: "flag_0002",
    key: "payments.card_network_failover",
    name: "Card network failover",
    description: "Route card traffic to the secondary acquirer.",
    flagType: "kill_switch",
    environment: "production",
    owner: "payments",
    rolloutPercent: 0,
    customerFacing: false,
    expiresInDays: null,
  },
  {
    id: "flag_0003",
    key: "onboarding.document_autocapture",
    name: "Document auto-capture",
    description: "Auto-capture identity documents in the mobile onboarding flow.",
    flagType: "release",
    environment: "production",
    owner: "onboarding",
    rolloutPercent: 100,
    customerFacing: true,
    expiresInDays: 14,
  },
  {
    id: "flag_0004",
    key: "onboarding.sanctions_rescreen_daily",
    name: "Daily sanctions re-screen",
    description: "Re-screen onboarded customers against sanctions lists daily.",
    flagType: "ops",
    environment: "production",
    owner: "compliance",
    rolloutPercent: 100,
    customerFacing: false,
    expiresInDays: null,
  },
  {
    id: "flag_0005",
    key: "risk.model_v4_shadow",
    name: "Risk model v4 in shadow",
    description: "Score transactions with risk model v4 without acting on it.",
    flagType: "experiment",
    environment: "production",
    owner: "risk",
    rolloutPercent: 50,
    customerFacing: false,
    expiresInDays: 45,
  },
  {
    id: "flag_0006",
    key: "risk.manual_review_bypass",
    name: "Manual review bypass",
    description: "Skip manual review for customers below the low-risk threshold.",
    flagType: "permission",
    environment: "production",
    owner: "risk",
    rolloutPercent: 0,
    customerFacing: false,
    expiresInDays: null,
    lastNote: "Off since the false-negative spike in the last review cycle.",
  },
  {
    id: "flag_0007",
    key: "console.bulk_refunds",
    name: "Bulk refunds",
    description: "Allow operators to refund a batch of payments in one action.",
    flagType: "permission",
    environment: "production",
    owner: "operations",
    rolloutPercent: 0,
    customerFacing: false,
    expiresInDays: null,
  },
  {
    id: "flag_0009",
    key: "ledger.double_entry_rewrite",
    name: "Double-entry ledger rewrite",
    description: "Write ledger entries through the new double-entry service.",
    flagType: "release",
    environment: "development",
    owner: "ledger",
    rolloutPercent: 10,
    customerFacing: false,
    expiresInDays: 60,
  },
  {
    id: "flag_0010",
    key: "ledger.legacy_reconciliation",
    name: "Legacy reconciliation",
    description: "Run the pre-migration reconciliation job alongside the new one.",
    flagType: "ops",
    environment: "production",
    owner: "ledger",
    rolloutPercent: 100,
    customerFacing: false,
    expiresInDays: -20,
    lastNote: "Past its review date; the migration finished last quarter.",
  },
  {
    id: "flag_0011",
    key: "notifications.sms_fallback",
    name: "SMS fallback",
    description: "Fall back to SMS when a push notification is undelivered.",
    flagType: "ops",
    environment: "production",
    owner: "notifications",
    rolloutPercent: 100,
    customerFacing: true,
    expiresInDays: null,
  },
  {
    id: "flag_0012",
    key: "notifications.marketing_digest",
    name: "Marketing digest email",
    description: "Weekly product digest email.",
    flagType: "experiment",
    environment: "production",
    owner: "growth",
    rolloutPercent: 0,
    customerFacing: true,
    expiresInDays: 21,
  },
];

/**
 * Idempotent: re-running restores the demo flags to their opening state, and
 * removes any flag no longer in the set. Ids stay fixed so a removed flag
 * never shifts the others.
 */
export function seedFeatureFlags(): void {
  const now = Date.now();
  FLAGS.forEach((f, i) => {
    const row = {
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      flagType: f.flagType,
      environment: f.environment,
      owner: f.owner,
      enabled: f.rolloutPercent > 0 ? 1 : 0,
      rolloutPercent: f.rolloutPercent,
      customerFacing: f.customerFacing ? 1 : 0,
      status: statusFor(f.rolloutPercent),
      expiresAt: f.expiresInDays === null ? null : now + f.expiresInDays * DAY,
      lastChangedBy: null,
      lastChangedAt: now - (i + 1) * DAY,
      lastNote: f.lastNote ?? null,
      version: 1,
    };
    db.insert(featureFlags)
      .values(row)
      .onConflictDoUpdate({ target: featureFlags.id, set: row })
      .run();
  });
  db.delete(featureFlags)
    .where(notInArray(featureFlags.id, FLAGS.map((f) => f.id)))
    .run();
}

function statusFor(percent: number): string {
  if (percent === 0) return "off";
  return percent === 100 ? "on" : "partial";
}
