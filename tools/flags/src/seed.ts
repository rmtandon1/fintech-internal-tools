import { db } from "@console/db";
import { featureFlags } from "./schema";

const DAY = 24 * 60 * 60 * 1000;

interface SeedFlag {
  key: string;
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
    key: "payments.instant_payouts",
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
    key: "payments.card_network_failover",
    description: "Route card traffic to the secondary acquirer.",
    flagType: "kill_switch",
    environment: "production",
    owner: "payments",
    rolloutPercent: 0,
    customerFacing: false,
    expiresInDays: null,
  },
  {
    key: "onboarding.document_autocapture",
    description: "Auto-capture identity documents in the mobile onboarding flow.",
    flagType: "release",
    environment: "production",
    owner: "onboarding",
    rolloutPercent: 100,
    customerFacing: true,
    expiresInDays: 14,
  },
  {
    key: "onboarding.sanctions_rescreen_daily",
    description: "Re-screen onboarded customers against sanctions lists daily.",
    flagType: "ops",
    environment: "production",
    owner: "compliance",
    rolloutPercent: 100,
    customerFacing: false,
    expiresInDays: null,
  },
  {
    key: "risk.model_v4_shadow",
    description: "Score transactions with risk model v4 without acting on it.",
    flagType: "experiment",
    environment: "production",
    owner: "risk",
    rolloutPercent: 50,
    customerFacing: false,
    expiresInDays: 45,
  },
  {
    key: "risk.manual_review_bypass",
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
    key: "console.bulk_refunds",
    description: "Allow operators to refund a batch of payments in one action.",
    flagType: "permission",
    environment: "production",
    owner: "operations",
    rolloutPercent: 0,
    customerFacing: false,
    expiresInDays: null,
  },
  {
    key: "console.dark_mode",
    description: "Dark theme for the internal console.",
    flagType: "release",
    environment: "staging",
    owner: "operations",
    rolloutPercent: 100,
    customerFacing: false,
    expiresInDays: 7,
  },
  {
    key: "ledger.double_entry_rewrite",
    description: "Write ledger entries through the new double-entry service.",
    flagType: "release",
    environment: "development",
    owner: "ledger",
    rolloutPercent: 10,
    customerFacing: false,
    expiresInDays: 60,
  },
  {
    key: "ledger.legacy_reconciliation",
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
    key: "notifications.sms_fallback",
    description: "Fall back to SMS when a push notification is undelivered.",
    flagType: "ops",
    environment: "production",
    owner: "notifications",
    rolloutPercent: 100,
    customerFacing: true,
    expiresInDays: null,
  },
  {
    key: "notifications.marketing_digest",
    description: "Weekly product digest email.",
    flagType: "experiment",
    environment: "production",
    owner: "growth",
    rolloutPercent: 0,
    customerFacing: true,
    expiresInDays: 21,
  },
];

/** Idempotent: re-running restores the demo flags to their opening state. */
export function seedFeatureFlags(): void {
  const now = Date.now();
  FLAGS.forEach((f, i) => {
    const row = {
      id: `flag_${String(i + 1).padStart(4, "0")}`,
      key: f.key,
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
}

function statusFor(percent: number): string {
  if (percent === 0) return "off";
  return percent === 100 ? "on" : "partial";
}
