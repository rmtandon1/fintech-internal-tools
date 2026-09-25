import { db } from "@console/db";
import { refunds } from "./schema";

const HOUR = 60 * 60 * 1000;

/** Static rates: the reference amount is frozen, not recomputed at read time. */
const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  SEK: 0.095,
  JPY: 0.0067,
};

interface SeedRefund {
  id: string;
  paymentId: string;
  customerEmail: string;
  cardLast4: string;
  merchant: string;
  psp: string;
  currency: string;
  capturedMinor: number;
  refundedMinor: number;
  amountMinor: number;
  reasonCode: string;
  disputed: boolean;
  status: string;
  requestedHoursAgo: number;
  lastNote?: string;
}

/**
 * Demo refunds covering each branch: straight-through, manager threshold,
 * admin threshold, goodwill, over-refund, open dispute, plus in-flight and
 * settled rows.
 */
const REFUNDS: SeedRefund[] = [
  {
    id: "rfnd_0001",
    paymentId: "pay_8842193",
    customerEmail: "helena.vasquez@example.com",
    cardLast4: "4417",
    merchant: "Northwind Freight",
    psp: "stripe",
    currency: "EUR",
    capturedMinor: 12_900,
    refundedMinor: 0,
    amountMinor: 12_900,
    reasonCode: "not_received",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 2,
  },
  {
    id: "rfnd_0002",
    paymentId: "pay_9910477",
    customerEmail: "tomas.reinholt@example.com",
    cardLast4: "9032",
    merchant: "Kestrel Outdoors",
    psp: "adyen",
    currency: "SEK",
    capturedMinor: 249_000,
    refundedMinor: 0,
    amountMinor: 249_000,
    reasonCode: "faulty",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 5,
  },
  {
    id: "rfnd_0003",
    paymentId: "pay_7731204",
    customerEmail: "priya.raghunathan@example.com",
    cardLast4: "7781",
    merchant: "Atlas Software",
    psp: "stripe",
    currency: "USD",
    capturedMinor: 180_000,
    refundedMinor: 0,
    amountMinor: 180_000,
    reasonCode: "cancelled",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 11,
    lastNote: "Annual licence cancelled inside the cooling-off window.",
  },
  {
    id: "rfnd_0004",
    paymentId: "pay_6620931",
    customerEmail: "kyb@harbourpointcapital.example.com",
    cardLast4: "1180",
    merchant: "Harbour Point Capital",
    psp: "adyen",
    currency: "USD",
    capturedMinor: 1_450_000,
    refundedMinor: 0,
    amountMinor: 1_450_000,
    reasonCode: "duplicate",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 14,
    lastNote: "Duplicate settlement confirmed against the scheme report.",
  },
  {
    id: "rfnd_0005",
    paymentId: "pay_5519028",
    customerEmail: "orla.kavanagh@example.com",
    cardLast4: "3390",
    merchant: "Kestrel Outdoors",
    psp: "stripe",
    currency: "GBP",
    capturedMinor: 8_400,
    refundedMinor: 0,
    amountMinor: 8_400,
    reasonCode: "goodwill",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 20,
    lastNote: "Repeat delivery delay; retention offered a full goodwill refund.",
  },
  {
    id: "rfnd_0006",
    paymentId: "pay_4471820",
    customerEmail: "lukas.brenner@example.com",
    cardLast4: "2245",
    merchant: "Atlas Software",
    psp: "checkout",
    currency: "EUR",
    capturedMinor: 30_000,
    refundedMinor: 25_000,
    amountMinor: 10_000,
    reasonCode: "duplicate",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 26,
    lastNote: "Second partial refund requested on an already-refunded payment.",
  },
  {
    id: "rfnd_0007",
    paymentId: "pay_3391847",
    customerEmail: "selim.aydin@example.com",
    cardLast4: "6612",
    merchant: "Northwind Freight",
    psp: "stripe",
    currency: "USD",
    capturedMinor: 74_500,
    refundedMinor: 0,
    amountMinor: 74_500,
    reasonCode: "fraud",
    disputed: true,
    status: "requested",
    requestedHoursAgo: 31,
    lastNote: "Cardholder has already filed a chargeback with the issuer.",
  },
  {
    id: "rfnd_0008",
    paymentId: "pay_2298471",
    customerEmail: "adaeze.okonkwo@example.com",
    cardLast4: "8890",
    merchant: "Atlas Software",
    psp: "adyen",
    currency: "JPY",
    capturedMinor: 980_000,
    refundedMinor: 0,
    amountMinor: 980_000,
    reasonCode: "not_received",
    disputed: false,
    status: "executing",
    requestedHoursAgo: 40,
    lastNote: "Sent to the processor, awaiting settlement confirmation.",
  },
  {
    id: "rfnd_0009",
    paymentId: "pay_1120934",
    customerEmail: "mina.halvorsen@example.com",
    cardLast4: "5501",
    merchant: "Kestrel Outdoors",
    psp: "checkout",
    currency: "EUR",
    capturedMinor: 5_600,
    refundedMinor: 0,
    amountMinor: 5_600,
    reasonCode: "faulty",
    disputed: false,
    status: "failed",
    requestedHoursAgo: 52,
    lastNote: "Processor returned card_expired; needs a bank transfer instead.",
  },
  {
    id: "rfnd_0010",
    paymentId: "pay_1004422",
    customerEmail: "viktor.sandoval@example.com",
    cardLast4: "7712",
    merchant: "Northwind Freight",
    psp: "stripe",
    currency: "USD",
    capturedMinor: 22_000,
    refundedMinor: 22_000,
    amountMinor: 22_000,
    reasonCode: "cancelled",
    disputed: false,
    status: "settled",
    requestedHoursAgo: 96,
    lastNote: "Processor reference re_9f21ab.",
  },
  // Four Kestrel not_received refunds, each under the manager line, $1,880 together.
  {
    id: "rfnd_0011",
    paymentId: "pay_3387210",
    customerEmail: "rasmus.lindgren@example.com",
    cardLast4: "4402",
    merchant: "Kestrel Outdoors",
    psp: "adyen",
    currency: "USD",
    capturedMinor: 48_000,
    refundedMinor: 0,
    amountMinor: 48_000,
    reasonCode: "not_received",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 8,
    lastNote: "Tracking shows the parcel never left the depot.",
  },
  {
    id: "rfnd_0012",
    paymentId: "pay_3387455",
    customerEmail: "noor.el-amin@example.com",
    cardLast4: "1276",
    merchant: "Kestrel Outdoors",
    psp: "adyen",
    currency: "USD",
    capturedMinor: 47_500,
    refundedMinor: 0,
    amountMinor: 47_500,
    reasonCode: "not_received",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 27,
    lastNote: "Customer reports no delivery; carrier has no scan events.",
  },
  {
    id: "rfnd_0013",
    paymentId: "pay_3388019",
    customerEmail: "gwen.ashworth@example.com",
    cardLast4: "9950",
    merchant: "Kestrel Outdoors",
    psp: "stripe",
    currency: "USD",
    capturedMinor: 46_000,
    refundedMinor: 0,
    amountMinor: 46_000,
    reasonCode: "not_received",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 55,
    lastNote: "Second not-received claim on this merchant this week.",
  },
  {
    id: "rfnd_0014",
    paymentId: "pay_3388342",
    customerEmail: "ivo.marchetti@example.com",
    cardLast4: "6031",
    merchant: "Kestrel Outdoors",
    psp: "stripe",
    currency: "USD",
    capturedMinor: 46_500,
    refundedMinor: 0,
    amountMinor: 46_500,
    reasonCode: "not_received",
    disputed: false,
    status: "requested",
    requestedHoursAgo: 80,
    lastNote: "Merchant has not responded to the delivery query.",
  },
];

/** Idempotent: re-running restores the demo refunds to their opening state. */
export function seedRefunds(): void {
  const now = Date.now();
  for (const r of REFUNDS) {
    const requestedAt = now - r.requestedHoursAgo * HOUR;
    const row = {
      id: r.id,
      paymentId: r.paymentId,
      customerEmail: r.customerEmail,
      cardLast4: r.cardLast4,
      merchant: r.merchant,
      psp: r.psp,
      currency: r.currency,
      capturedMinor: r.capturedMinor,
      refundedMinor: r.refundedMinor,
      amountMinor: r.amountMinor,
      usdMinor: usdMinor(r.amountMinor, r.currency),
      reasonCode: r.reasonCode,
      disputed: r.disputed ? 1 : 0,
      status: r.status,
      requestedBy: null,
      requestedAt,
      settledAt: r.status === "settled" ? requestedAt + 6 * HOUR : null,
      lastNote: r.lastNote ?? null,
      version: 1,
    };
    db.insert(refunds).values(row).onConflictDoUpdate({ target: refunds.id, set: row }).run();
  }
}

function usdMinor(minor: number, currency: string): number {
  return Math.round(minor * (USD_PER_UNIT[currency] ?? 1));
}
