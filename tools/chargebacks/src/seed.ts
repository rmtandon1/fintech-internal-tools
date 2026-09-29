import { db } from "@console/db";
import { disputes } from "./schema";

const HOUR = 60 * 60 * 1000;

type SeedDispute = [
  id: string,
  cardNetwork: string,
  reasonCode: string,
  reasonCategory: string,
  merchant: string,
  usdMinor: number,
  openedHoursFromExport: number,
  dueHoursFromExport: number,
  status: string,
  evidenceUploaded: boolean,
  notes: string,
];

/**
 * `fixtures/power-apps/chargebacks/Data/disputes.csv`, one row per dispute.
 * The export was taken on 28 September 2026 at 09:00 UTC and its deadlines
 * only mean something relative to that moment, so each date is kept as its
 * offset in hours from the export and seeded relative to now.
 */
export const DISPUTES: readonly SeedDispute[] = [
  ["DSP-20401", "visa", "10.4", "fraud", "Kestrel Outdoors", 248000, -216, 20, "open", false, "Cardholder disputes the charge; no response yet."],
  ["DSP-20402", "mastercard", "4855", "not_received", "Aster Fitness", 67319, -1176, -792, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20403", "amex", "C28", "cancelled", "Meridian Travel Co", 2174, -279, 16, "open", false, "Awaiting review."],
  ["DSP-20404", "mastercard", "4853", "not_as_described", "Kestrel Outdoors", 334303, -264, 120, "fighting", true, "Evidence submitted to the network."],
  ["DSP-20405", "mastercard", "4837", "fraud", "Northwind Cycles", 249565, -720, -72, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20406", "mastercard", "4853", "not_as_described", "Sable & Oak Furniture", 172550, -264, 33, "open", false, "Customer says the item did not match the listing."],
  ["DSP-20407", "amex", "P08", "duplicate", "Kestrel Outdoors", 58347, -164, 349, "open", false, "Awaiting review."],
  ["DSP-20408", "visa", "13.1", "not_received", "Copperfield Grocers", 102651, -1224, -552, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20409", "amex", "P08", "duplicate", "Sable & Oak Furniture", 52108, -52, 29, "evidence_requested", true, "Asked the merchant for the delivery confirmation."],
  ["DSP-20410", "amex", "P08", "duplicate", "Quill Stationery", 440338, -245, 201, "open", false, "Awaiting review."],
  ["DSP-20411", "mastercard", "4853", "not_as_described", "Meridian Travel Co", 11887, -576, -192, "lost", true, "Deadline missed; closed as lost."],
  ["DSP-20412", "amex", "C08", "not_received", "Lumen Audio", 116000, -288, 44, "open", false, "Customer says the item did not match the listing."],
  ["DSP-20413", "amex", "P08", "duplicate", "Pinecrest Books", 178884, -1248, -648, "lost", true, "Deadline missed; closed as lost."],
  ["DSP-20414", "mastercard", "4834", "duplicate", "Pinecrest Books", 281691, -840, -432, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20415", "mastercard", "4837", "fraud", "Northwind Cycles", 12413, -29, 336, "evidence_requested", false, "Asked the merchant for the delivery confirmation."],
  ["DSP-20416", "visa", "12.6", "duplicate", "Tidewater Marine Supply", 275925, -744, -96, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20417", "visa", "10.4", "fraud", "Aster Fitness", 21681, -295, 41, "evidence_requested", false, "Asked the merchant for the delivery confirmation."],
  ["DSP-20418", "visa", "13.1", "not_received", "Pinecrest Books", 8620, -1032, -408, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20419", "mastercard", "4834", "duplicate", "Pinecrest Books", 52421, -87, 99, "open", false, "Awaiting review."],
  ["DSP-20420", "mastercard", "4841", "cancelled", "Copperfield Grocers", 153262, -576, -72, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20421", "amex", "C31", "not_as_described", "Copperfield Grocers", 73395, -816, -120, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20422", "amex", "P08", "duplicate", "Meridian Travel Co", 91654, -864, -312, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20423", "mastercard", "4841", "cancelled", "Lumen Audio", 119499, -1224, -696, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20424", "mastercard", "4841", "cancelled", "Sable & Oak Furniture", 251016, -288, 24, "fighting", true, "Evidence submitted to the network."],
  ["DSP-20425", "mastercard", "4834", "duplicate", "Brightwater Pets", 147161, -1296, -840, "lost", true, "Deadline missed; closed as lost."],
  ["DSP-20426", "amex", "C31", "not_as_described", "Harbor Lane Coffee", 52739, -28, 339, "open", false, "Awaiting review."],
  ["DSP-20427", "mastercard", "4841", "cancelled", "Aster Fitness", 26730, -1128, -408, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20428", "amex", "C28", "cancelled", "Northwind Cycles", 268688, -226, 194, "open", false, "Awaiting review."],
  ["DSP-20429", "amex", "C31", "not_as_described", "Kestrel Outdoors", 23309, -1392, -888, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20430", "mastercard", "4837", "fraud", "Kestrel Outdoors", 45797, -81, 32, "open", false, "Awaiting review."],
  ["DSP-20431", "amex", "C31", "not_as_described", "Lumen Audio", 46581, -48, 186, "open", false, "Awaiting review."],
  ["DSP-20432", "visa", "13.1", "not_received", "Lumen Audio", 54339, -284, 255, "open", false, "Awaiting review."],
  ["DSP-20433", "mastercard", "4837", "fraud", "Brightwater Pets", 285807, -936, -336, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20434", "amex", "P08", "duplicate", "Brightwater Pets", 121350, -720, -96, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20435", "visa", "12.6", "duplicate", "Sable & Oak Furniture", 133518, -960, -408, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20436", "visa", "13.2", "cancelled", "Copperfield Grocers", 85880, -672, -264, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20437", "amex", "C28", "cancelled", "Quill Stationery", 191938, -744, -384, "lost", true, "Deadline missed; closed as lost."],
  ["DSP-20438", "mastercard", "4834", "duplicate", "Harbor Lane Coffee", 17849, -242, 278, "open", false, "Awaiting review."],
  ["DSP-20439", "mastercard", "4853", "not_as_described", "Sable & Oak Furniture", 26395, -816, -336, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20440", "amex", "C08", "not_received", "Brightwater Pets", 6582, -168, 261, "open", false, "Awaiting review."],
  ["DSP-20441", "visa", "10.4", "fraud", "Lumen Audio", 128436, -1032, -336, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20442", "amex", "P08", "duplicate", "Lumen Audio", 254290, -336, 96, "fighting", true, "Evidence submitted to the network."],
  ["DSP-20443", "visa", "10.4", "fraud", "Lumen Audio", 14652, -480, 72, "fighting", true, "Evidence submitted to the network."],
  ["DSP-20444", "amex", "F29", "fraud", "Pinecrest Books", 31006, -792, -120, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20445", "mastercard", "4855", "not_received", "Brightwater Pets", 119772, -1008, -288, "won", true, "Network ruled in the merchant's favour."],
  ["DSP-20446", "amex", "C28", "cancelled", "Meridian Travel Co", 41879, -231, 34, "open", false, "Awaiting review."],
  ["DSP-20447", "mastercard", "4853", "not_as_described", "Quill Stationery", 10690, -24, 288, "open", false, "Awaiting review."],
  ["DSP-20448", "mastercard", "4834", "duplicate", "Tidewater Marine Supply", 72476, -121, 23, "open", false, "Awaiting review."],
  ["DSP-20449", "visa", "10.4", "fraud", "Lumen Audio", 228900, -720, -336, "accepted", false, "Accepted; refund issued to the cardholder."],
  ["DSP-20450", "mastercard", "4841", "cancelled", "Tidewater Marine Supply", 207813, -1224, -816, "accepted", false, "Accepted; refund issued to the cardholder."],
];

/** Idempotent: re-running restores the exported disputes to their opening state. */
export function seedDisputes(): void {
  const now = Date.now();
  for (const [
    id,
    cardNetwork,
    reasonCode,
    reasonCategory,
    merchant,
    usdMinor,
    openedHours,
    dueHours,
    status,
    evidenceUploaded,
    notes,
  ] of DISPUTES) {
    const row = {
      id,
      cardNetwork,
      reasonCode,
      reasonCategory,
      merchant,
      usdMinor,
      openedAt: now + openedHours * HOUR,
      dueAt: now + dueHours * HOUR,
      status,
      evidenceUploaded: evidenceUploaded ? 1 : 0,
      notes,
      version: 1,
    };
    db.insert(disputes).values(row).onConflictDoUpdate({ target: disputes.id, set: row }).run();
  }
}
