import { db } from "@console/db";
import { EXPORT_SNAPSHOT, EXPORTED_DISPUTES } from "./disputes";
import { chargebacks } from "./schema";

/**
 * Installs the exported disputes. Each OpenedOn and DueDate keeps its offset
 * from the export snapshot, so a dispute due in 20 hours at export is due in
 * 20 hours after seeding. Re-running restores the exported state.
 */
export function seedChargebacks(now: number = Date.now()): void {
  const shift = now - Date.parse(EXPORT_SNAPSHOT);
  for (const d of EXPORTED_DISPUTES) {
    const row = {
      id: d.id,
      cardNetwork: d.cardNetwork,
      reasonCode: d.reasonCode,
      reasonCategory: d.reasonCategory,
      merchant: d.merchant,
      amountMinor: d.amountMinor,
      openedAt: Date.parse(d.openedOn) + shift,
      dueAt: Date.parse(d.dueDate) + shift,
      status: d.status,
      evidenceUploaded: d.evidenceUploaded ? 1 : 0,
      notes: d.notes,
      decidedBy: null,
      version: 1,
    };
    db.insert(chargebacks)
      .values(row)
      .onConflictDoUpdate({ target: chargebacks.id, set: row })
      .run();
  }
}
