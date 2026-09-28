import { db } from "@console/db";
import { disputes } from "./schema";

const HOUR = 60 * 60 * 1000;

/** When the Power Apps export was taken: 28 September 2026, 09:00 UTC. */
export const EXPORT_AT = Date.UTC(2026, 8, 28, 9, 0, 0);

export interface DisputeSeed {
  id: string;
  cardNetwork: string;
  reasonCode: string;
  reasonCategory: string;
  merchant: string;
  amountUsdMinor: number;
  /** Hours from the export time to OpenedOn. */
  openedHours: number;
  /** Hours from the export time to DueDate. */
  dueHours: number;
  status: string;
  evidenceUploaded: boolean;
  notes: string | null;
}

/**
 * The 50 rows of fixtures/power-apps/chargebacks/Data/disputes.csv, with
 * choice values as codes, AmountUSD in cents and both dates as hours from the
 * export time.
 */
export const DISPUTES: readonly DisputeSeed[] = [
  { id: "DSP-20401", cardNetwork: "visa", reasonCode: "10.4", reasonCategory: "fraud", merchant: "Kestrel Outdoors", amountUsdMinor: 248000, openedHours: -216, dueHours: 20, status: "open", evidenceUploaded: false, notes: "Cardholder disputes the charge; no response yet." },
  { id: "DSP-20402", cardNetwork: "mastercard", reasonCode: "4855", reasonCategory: "not_received", merchant: "Aster Fitness", amountUsdMinor: 67319, openedHours: -1176, dueHours: -792, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20403", cardNetwork: "amex", reasonCode: "C28", reasonCategory: "cancelled", merchant: "Meridian Travel Co", amountUsdMinor: 2174, openedHours: -279, dueHours: 16, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20404", cardNetwork: "mastercard", reasonCode: "4853", reasonCategory: "not_as_described", merchant: "Kestrel Outdoors", amountUsdMinor: 334303, openedHours: -264, dueHours: 120, status: "fighting", evidenceUploaded: true, notes: "Evidence submitted to the network." },
  { id: "DSP-20405", cardNetwork: "mastercard", reasonCode: "4837", reasonCategory: "fraud", merchant: "Northwind Cycles", amountUsdMinor: 249565, openedHours: -720, dueHours: -72, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20406", cardNetwork: "mastercard", reasonCode: "4853", reasonCategory: "not_as_described", merchant: "Sable & Oak Furniture", amountUsdMinor: 172550, openedHours: -264, dueHours: 33, status: "open", evidenceUploaded: false, notes: "Customer says the item did not match the listing." },
  { id: "DSP-20407", cardNetwork: "amex", reasonCode: "P08", reasonCategory: "duplicate", merchant: "Kestrel Outdoors", amountUsdMinor: 58347, openedHours: -164, dueHours: 349, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20408", cardNetwork: "visa", reasonCode: "13.1", reasonCategory: "not_received", merchant: "Copperfield Grocers", amountUsdMinor: 102651, openedHours: -1224, dueHours: -552, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20409", cardNetwork: "amex", reasonCode: "P08", reasonCategory: "duplicate", merchant: "Sable & Oak Furniture", amountUsdMinor: 52108, openedHours: -52, dueHours: 29, status: "evidence_requested", evidenceUploaded: true, notes: "Asked the merchant for the delivery confirmation." },
  { id: "DSP-20410", cardNetwork: "amex", reasonCode: "P08", reasonCategory: "duplicate", merchant: "Quill Stationery", amountUsdMinor: 440338, openedHours: -245, dueHours: 201, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20411", cardNetwork: "mastercard", reasonCode: "4853", reasonCategory: "not_as_described", merchant: "Meridian Travel Co", amountUsdMinor: 11887, openedHours: -576, dueHours: -192, status: "lost", evidenceUploaded: true, notes: "Deadline missed; closed as lost." },
  { id: "DSP-20412", cardNetwork: "amex", reasonCode: "C08", reasonCategory: "not_received", merchant: "Lumen Audio", amountUsdMinor: 116000, openedHours: -288, dueHours: 44, status: "open", evidenceUploaded: false, notes: "Customer says the item did not match the listing." },
  { id: "DSP-20413", cardNetwork: "amex", reasonCode: "P08", reasonCategory: "duplicate", merchant: "Pinecrest Books", amountUsdMinor: 178884, openedHours: -1248, dueHours: -648, status: "lost", evidenceUploaded: true, notes: "Deadline missed; closed as lost." },
  { id: "DSP-20414", cardNetwork: "mastercard", reasonCode: "4834", reasonCategory: "duplicate", merchant: "Pinecrest Books", amountUsdMinor: 281691, openedHours: -840, dueHours: -432, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20415", cardNetwork: "mastercard", reasonCode: "4837", reasonCategory: "fraud", merchant: "Northwind Cycles", amountUsdMinor: 12413, openedHours: -29, dueHours: 336, status: "evidence_requested", evidenceUploaded: false, notes: "Asked the merchant for the delivery confirmation." },
  { id: "DSP-20416", cardNetwork: "visa", reasonCode: "12.6", reasonCategory: "duplicate", merchant: "Tidewater Marine Supply", amountUsdMinor: 275925, openedHours: -744, dueHours: -96, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20417", cardNetwork: "visa", reasonCode: "10.4", reasonCategory: "fraud", merchant: "Aster Fitness", amountUsdMinor: 21681, openedHours: -295, dueHours: 41, status: "evidence_requested", evidenceUploaded: false, notes: "Asked the merchant for the delivery confirmation." },
  { id: "DSP-20418", cardNetwork: "visa", reasonCode: "13.1", reasonCategory: "not_received", merchant: "Pinecrest Books", amountUsdMinor: 8620, openedHours: -1032, dueHours: -408, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20419", cardNetwork: "mastercard", reasonCode: "4834", reasonCategory: "duplicate", merchant: "Pinecrest Books", amountUsdMinor: 52421, openedHours: -87, dueHours: 99, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20420", cardNetwork: "mastercard", reasonCode: "4841", reasonCategory: "cancelled", merchant: "Copperfield Grocers", amountUsdMinor: 153262, openedHours: -576, dueHours: -72, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20421", cardNetwork: "amex", reasonCode: "C31", reasonCategory: "not_as_described", merchant: "Copperfield Grocers", amountUsdMinor: 73395, openedHours: -816, dueHours: -120, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20422", cardNetwork: "amex", reasonCode: "P08", reasonCategory: "duplicate", merchant: "Meridian Travel Co", amountUsdMinor: 91654, openedHours: -864, dueHours: -312, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20423", cardNetwork: "mastercard", reasonCode: "4841", reasonCategory: "cancelled", merchant: "Lumen Audio", amountUsdMinor: 119499, openedHours: -1224, dueHours: -696, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20424", cardNetwork: "mastercard", reasonCode: "4841", reasonCategory: "cancelled", merchant: "Sable & Oak Furniture", amountUsdMinor: 251016, openedHours: -288, dueHours: 24, status: "fighting", evidenceUploaded: true, notes: "Evidence submitted to the network." },
  { id: "DSP-20425", cardNetwork: "mastercard", reasonCode: "4834", reasonCategory: "duplicate", merchant: "Brightwater Pets", amountUsdMinor: 147161, openedHours: -1296, dueHours: -840, status: "lost", evidenceUploaded: true, notes: "Deadline missed; closed as lost." },
  { id: "DSP-20426", cardNetwork: "amex", reasonCode: "C31", reasonCategory: "not_as_described", merchant: "Harbor Lane Coffee", amountUsdMinor: 52739, openedHours: -28, dueHours: 339, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20427", cardNetwork: "mastercard", reasonCode: "4841", reasonCategory: "cancelled", merchant: "Aster Fitness", amountUsdMinor: 26730, openedHours: -1128, dueHours: -408, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20428", cardNetwork: "amex", reasonCode: "C28", reasonCategory: "cancelled", merchant: "Northwind Cycles", amountUsdMinor: 268688, openedHours: -226, dueHours: 194, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20429", cardNetwork: "amex", reasonCode: "C31", reasonCategory: "not_as_described", merchant: "Kestrel Outdoors", amountUsdMinor: 23309, openedHours: -1392, dueHours: -888, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20430", cardNetwork: "mastercard", reasonCode: "4837", reasonCategory: "fraud", merchant: "Kestrel Outdoors", amountUsdMinor: 45797, openedHours: -81, dueHours: 32, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20431", cardNetwork: "amex", reasonCode: "C31", reasonCategory: "not_as_described", merchant: "Lumen Audio", amountUsdMinor: 46581, openedHours: -48, dueHours: 186, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20432", cardNetwork: "visa", reasonCode: "13.1", reasonCategory: "not_received", merchant: "Lumen Audio", amountUsdMinor: 54339, openedHours: -284, dueHours: 255, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20433", cardNetwork: "mastercard", reasonCode: "4837", reasonCategory: "fraud", merchant: "Brightwater Pets", amountUsdMinor: 285807, openedHours: -936, dueHours: -336, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20434", cardNetwork: "amex", reasonCode: "P08", reasonCategory: "duplicate", merchant: "Brightwater Pets", amountUsdMinor: 121350, openedHours: -720, dueHours: -96, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20435", cardNetwork: "visa", reasonCode: "12.6", reasonCategory: "duplicate", merchant: "Sable & Oak Furniture", amountUsdMinor: 133518, openedHours: -960, dueHours: -408, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20436", cardNetwork: "visa", reasonCode: "13.2", reasonCategory: "cancelled", merchant: "Copperfield Grocers", amountUsdMinor: 85880, openedHours: -672, dueHours: -264, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20437", cardNetwork: "amex", reasonCode: "C28", reasonCategory: "cancelled", merchant: "Quill Stationery", amountUsdMinor: 191938, openedHours: -744, dueHours: -384, status: "lost", evidenceUploaded: true, notes: "Deadline missed; closed as lost." },
  { id: "DSP-20438", cardNetwork: "mastercard", reasonCode: "4834", reasonCategory: "duplicate", merchant: "Harbor Lane Coffee", amountUsdMinor: 17849, openedHours: -242, dueHours: 278, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20439", cardNetwork: "mastercard", reasonCode: "4853", reasonCategory: "not_as_described", merchant: "Sable & Oak Furniture", amountUsdMinor: 26395, openedHours: -816, dueHours: -336, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20440", cardNetwork: "amex", reasonCode: "C08", reasonCategory: "not_received", merchant: "Brightwater Pets", amountUsdMinor: 6582, openedHours: -168, dueHours: 261, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20441", cardNetwork: "visa", reasonCode: "10.4", reasonCategory: "fraud", merchant: "Lumen Audio", amountUsdMinor: 128436, openedHours: -1032, dueHours: -336, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20442", cardNetwork: "amex", reasonCode: "P08", reasonCategory: "duplicate", merchant: "Lumen Audio", amountUsdMinor: 254290, openedHours: -336, dueHours: 96, status: "fighting", evidenceUploaded: true, notes: "Evidence submitted to the network." },
  { id: "DSP-20443", cardNetwork: "visa", reasonCode: "10.4", reasonCategory: "fraud", merchant: "Lumen Audio", amountUsdMinor: 14652, openedHours: -480, dueHours: 72, status: "fighting", evidenceUploaded: true, notes: "Evidence submitted to the network." },
  { id: "DSP-20444", cardNetwork: "amex", reasonCode: "F29", reasonCategory: "fraud", merchant: "Pinecrest Books", amountUsdMinor: 31006, openedHours: -792, dueHours: -120, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20445", cardNetwork: "mastercard", reasonCode: "4855", reasonCategory: "not_received", merchant: "Brightwater Pets", amountUsdMinor: 119772, openedHours: -1008, dueHours: -288, status: "won", evidenceUploaded: true, notes: "Network ruled in the merchant's favour." },
  { id: "DSP-20446", cardNetwork: "amex", reasonCode: "C28", reasonCategory: "cancelled", merchant: "Meridian Travel Co", amountUsdMinor: 41879, openedHours: -231, dueHours: 34, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20447", cardNetwork: "mastercard", reasonCode: "4853", reasonCategory: "not_as_described", merchant: "Quill Stationery", amountUsdMinor: 10690, openedHours: -24, dueHours: 288, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20448", cardNetwork: "mastercard", reasonCode: "4834", reasonCategory: "duplicate", merchant: "Tidewater Marine Supply", amountUsdMinor: 72476, openedHours: -121, dueHours: 23, status: "open", evidenceUploaded: false, notes: "Awaiting review." },
  { id: "DSP-20449", cardNetwork: "visa", reasonCode: "10.4", reasonCategory: "fraud", merchant: "Lumen Audio", amountUsdMinor: 228900, openedHours: -720, dueHours: -336, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
  { id: "DSP-20450", cardNetwork: "mastercard", reasonCode: "4841", reasonCategory: "cancelled", merchant: "Tidewater Marine Supply", amountUsdMinor: 207813, openedHours: -1224, dueHours: -816, status: "accepted", evidenceUploaded: false, notes: "Accepted; refund issued to the cardholder." },
];

/**
 * Idempotent: re-running restores the disputes to their state at export,
 * with every date the same distance from `now` as it was from the export.
 */
export function seedDisputes(now: number = Date.now()): void {
  for (const d of DISPUTES) {
    const row = {
      id: d.id,
      cardNetwork: d.cardNetwork,
      reasonCode: d.reasonCode,
      reasonCategory: d.reasonCategory,
      merchant: d.merchant,
      amountUsdMinor: d.amountUsdMinor,
      openedAt: now + d.openedHours * HOUR,
      dueAt: now + d.dueHours * HOUR,
      status: d.status,
      evidenceUploaded: d.evidenceUploaded ? 1 : 0,
      notes: d.notes,
      version: 1,
    };
    db.insert(disputes).values(row).onConflictDoUpdate({ target: disputes.id, set: row }).run();
  }
}
