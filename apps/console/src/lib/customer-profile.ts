import type { GaugeBand, GaugeTone } from "@console/ui/gauge";
import type { GovernedRecord } from "@console/engine/types";

const HOUR = 60 * 60 * 1000;
/** Matches the KYC queue's "Due in 12h" filter. */
const DUE_SOON = 12 * HOUR;

/** The live approval thresholds a risk score is read against. */
export interface RiskThresholds {
  manager: number;
  admin: number;
}

/**
 * The risk scale in four bands. The two upper edges are the live approval
 * thresholds, so the gauge's colours say who has to sign off. The 40 edge
 * is where the case's risk tier turns from low to medium.
 */
export function riskBands({ manager, admin }: RiskThresholds): GaugeBand[] {
  const medium = Math.min(40, manager);
  return [
    { from: 0, to: medium, tone: "positive", label: "Low risk" },
    { from: medium, to: manager, tone: "caution", label: "Medium risk" },
    { from: manager, to: admin, tone: "warning", label: "High risk" },
    { from: admin, to: 100, tone: "negative", label: "Very high risk" },
  ];
}

/** Who has to approve a case with this score, in the analyst's words. */
export function approvalNeed(
  score: number,
  { manager, admin }: RiskThresholds,
): { tone: GaugeTone; text: string } {
  if (score >= admin) {
    return { tone: "negative", text: `An admin approves this case. The score is ${admin} or more.` };
  }
  if (score >= manager) {
    return { tone: "warning", text: `A manager approves this case. The score is ${manager} or more.` };
  }
  return { tone: "positive", text: "Any reviewer can approve this case." };
}

/** `Due in 5h`, `Overdue by 2d`: the SLA as a deadline, not a timestamp. */
export function dueLabel(dueAt: number, now: number): { tone: GaugeTone | "neutral"; text: string } {
  const delta = dueAt - now;
  const span = humanSpan(Math.abs(delta));
  if (delta < 0) return { tone: "negative", text: `Overdue by ${span}` };
  if (delta < DUE_SOON) return { tone: "warning", text: `Due in ${span}` };
  return { tone: "neutral", text: `Due in ${span}` };
}

function humanSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** 🇬🇧 from `GB`; empty for anything that is not a two-letter code. */
export function flagEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return "";
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** `United Kingdom` from `GB`, falling back to the code itself. */
export function countryName(iso: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(iso.toUpperCase()) ?? iso;
  } catch {
    return iso;
  }
}

/** `NF` for Northwind Freight Ltd; company suffixes are skipped. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w && !/^(ltd|llc|inc|plc|gmbh|sa|bv|ag)\.?$/i.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** The fields the customer card reads, checked rather than cast. */
export interface CustomerFacts {
  name: string;
  country: string;
  segment: string;
  documentType: string;
  riskScore: number;
  sanctionsHit: boolean;
  documentsComplete: boolean;
  openedAt: number;
  dueAt: number;
}

export function customerFacts(record: GovernedRecord): CustomerFacts | null {
  const s = (key: string) => (typeof record[key] === "string" ? String(record[key]) : null);
  const n = (key: string) => (typeof record[key] === "number" ? Number(record[key]) : null);
  const name = s("customerName");
  const country = s("country");
  const segment = s("segment");
  const documentType = s("documentType");
  const riskScore = n("riskScore");
  const sanctionsHit = n("sanctionsHit");
  const documentsComplete = n("documentsComplete");
  const openedAt = n("openedAt");
  const dueAt = n("dueAt");
  if (
    name === null ||
    country === null ||
    segment === null ||
    documentType === null ||
    riskScore === null ||
    sanctionsHit === null ||
    documentsComplete === null ||
    openedAt === null ||
    dueAt === null
  ) {
    return null;
  }
  return {
    name,
    country,
    segment,
    documentType,
    riskScore,
    sanctionsHit: sanctionsHit === 1,
    documentsComplete: documentsComplete === 1,
    openedAt,
    dueAt,
  };
}

/** The record fields the card shows in full, so the field grid can skip them. */
export const CUSTOMER_CARD_FIELDS = [
  "customerName",
  "country",
  "segment",
  "documentType",
  "riskScore",
  "riskTier",
  "sanctionsHit",
  "documentsComplete",
];
