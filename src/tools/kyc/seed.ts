import { db } from "@/db/client";
import { kycCases } from "./schema";

const HOUR = 60 * 60 * 1000;

interface SeedCase {
  id: string;
  customerName: string;
  email: string;
  dateOfBirth: string;
  documentType: string;
  documentNumber: string;
  country: string;
  segment: string;
  riskScore: number;
  sanctionsHit: boolean;
  documentsComplete: boolean;
  status: string;
  openedHoursAgo: number;
  lastNote?: string;
}

/**
 * Demo cases chosen to hit every policy branch: straight-through approval,
 * manager approval, admin approval, sanctions deny, missing-document deny,
 * prohibited country deny, plus already-decided cases for the audit trail.
 */
const CASES: SeedCase[] = [
  {
    id: "kyc_0001",
    customerName: "Helena Vasquez",
    email: "helena.vasquez@example.com",
    dateOfBirth: "1991-04-12",
    documentType: "passport",
    documentNumber: "P8842193",
    country: "ES",
    segment: "consumer",
    riskScore: 18,
    sanctionsHit: false,
    documentsComplete: true,
    status: "pending_review",
    openedHoursAgo: 3,
  },
  {
    id: "kyc_0002",
    customerName: "Tomas Reinholt",
    email: "tomas.reinholt@example.com",
    dateOfBirth: "1984-11-02",
    documentType: "national_id",
    documentNumber: "DK4471820",
    country: "DK",
    segment: "consumer",
    riskScore: 41,
    sanctionsHit: false,
    documentsComplete: true,
    status: "pending_review",
    openedHoursAgo: 9,
  },
  {
    id: "kyc_0003",
    customerName: "Northwind Freight Ltd",
    email: "ops@northwindfreight.example.com",
    dateOfBirth: "2016-02-29",
    documentType: "company_registry",
    documentNumber: "GB10774521",
    country: "GB",
    segment: "business",
    riskScore: 72,
    sanctionsHit: false,
    documentsComplete: true,
    status: "pending_review",
    openedHoursAgo: 20,
    lastNote: "Two UBOs verified, third pending confirmation from registry.",
  },
  {
    id: "kyc_0004",
    customerName: "Adaeze Okonkwo",
    email: "adaeze.okonkwo@example.com",
    dateOfBirth: "1996-07-23",
    documentType: "passport",
    documentNumber: "A2298471",
    country: "NG",
    segment: "consumer",
    riskScore: 88,
    sanctionsHit: false,
    documentsComplete: true,
    status: "pending_review",
    openedHoursAgo: 30,
    lastNote: "Source of funds questionnaire returned; high-risk corridor.",
  },
  {
    id: "kyc_0005",
    customerName: "Viktor Sandoval",
    email: "viktor.sandoval@example.com",
    dateOfBirth: "1979-01-08",
    documentType: "passport",
    documentNumber: "P1120934",
    country: "PA",
    segment: "consumer",
    riskScore: 91,
    sanctionsHit: true,
    documentsComplete: true,
    status: "escalated",
    openedHoursAgo: 46,
    lastNote: "Screening returned a probable match on a PEP list.",
  },
  {
    id: "kyc_0006",
    customerName: "Mina Halvorsen",
    email: "mina.halvorsen@example.com",
    dateOfBirth: "1999-09-30",
    documentType: "driving_licence",
    documentNumber: "NO5590128",
    country: "NO",
    segment: "consumer",
    riskScore: 34,
    sanctionsHit: false,
    documentsComplete: false,
    status: "info_requested",
    openedHoursAgo: 52,
    lastNote: "Proof of address is older than three months.",
  },
  {
    id: "kyc_0007",
    customerName: "Caspian Trading FZE",
    email: "compliance@caspiantrading.example.com",
    dateOfBirth: "2019-06-14",
    documentType: "company_registry",
    documentNumber: "AE88213470",
    country: "IR",
    segment: "business",
    riskScore: 79,
    sanctionsHit: false,
    documentsComplete: true,
    status: "pending_review",
    openedHoursAgo: 61,
    lastNote: "Registered address resolves to a prohibited jurisdiction.",
  },
  {
    id: "kyc_0008",
    customerName: "Priya Raghunathan",
    email: "priya.raghunathan@example.com",
    dateOfBirth: "1988-03-17",
    documentType: "passport",
    documentNumber: "Z7741209",
    country: "IN",
    segment: "consumer",
    riskScore: 55,
    sanctionsHit: false,
    documentsComplete: true,
    status: "pending_review",
    openedHoursAgo: 7,
  },
  {
    id: "kyc_0009",
    customerName: "Lukas Brenner",
    email: "lukas.brenner@example.com",
    dateOfBirth: "1973-12-05",
    documentType: "national_id",
    documentNumber: "DE3391847",
    country: "DE",
    segment: "consumer",
    riskScore: 22,
    sanctionsHit: false,
    documentsComplete: true,
    status: "approved",
    openedHoursAgo: 96,
    lastNote: "Straight-through approval, no adverse media.",
  },
  {
    id: "kyc_0010",
    customerName: "Orla Kavanagh",
    email: "orla.kavanagh@example.com",
    dateOfBirth: "1994-08-21",
    documentType: "passport",
    documentNumber: "IE2204418",
    country: "IE",
    segment: "consumer",
    riskScore: 64,
    sanctionsHit: false,
    documentsComplete: false,
    status: "info_requested",
    openedHoursAgo: 28,
    lastNote: "Selfie liveness check failed twice.",
  },
  {
    id: "kyc_0011",
    customerName: "Harbour Point Capital",
    email: "kyb@harbourpointcapital.example.com",
    dateOfBirth: "2011-10-03",
    documentType: "company_registry",
    documentNumber: "US77219043",
    country: "US",
    segment: "business",
    riskScore: 68,
    sanctionsHit: false,
    documentsComplete: true,
    status: "escalated",
    openedHoursAgo: 71,
    lastNote: "Complex ownership chain across three jurisdictions.",
  },
  {
    id: "kyc_0012",
    customerName: "Selim Aydin",
    email: "selim.aydin@example.com",
    dateOfBirth: "1990-05-19",
    documentType: "passport",
    documentNumber: "TR6612390",
    country: "TR",
    segment: "consumer",
    riskScore: 47,
    sanctionsHit: false,
    documentsComplete: true,
    status: "rejected",
    openedHoursAgo: 120,
    lastNote: "Document tampering detected on the uploaded passport page.",
  },
];

/** Idempotent: re-running restores the demo cases to their opening state. */
export function seedKycCases(): void {
  const now = Date.now();
  for (const c of CASES) {
    const openedAt = now - c.openedHoursAgo * HOUR;
    const row = {
      id: c.id,
      customerName: c.customerName,
      email: c.email,
      dateOfBirth: c.dateOfBirth,
      documentType: c.documentType,
      documentNumber: c.documentNumber,
      country: c.country,
      segment: c.segment,
      riskScore: c.riskScore,
      riskTier: tierFor(c.riskScore),
      sanctionsHit: c.sanctionsHit ? 1 : 0,
      documentsComplete: c.documentsComplete ? 1 : 0,
      status: c.status,
      openedAt,
      dueAt: openedAt + 48 * HOUR,
      lastNote: c.lastNote ?? null,
      decidedBy: null,
      version: 1,
    };
    db.insert(kycCases).values(row).onConflictDoUpdate({ target: kycCases.id, set: row }).run();
  }
}

function tierFor(score: number): string {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
