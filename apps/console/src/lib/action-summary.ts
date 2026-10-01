/**
 * Reads a tool-wide action's summary when it lists records with a result each,
 * in the form "<headline>: <id> <result>, <id> <result>", such as the
 * Companies House recheck's "… of 4 merchants: kyc_0104 liquidation, kyc_0105
 * active". The Rules panel then lists each record by name. Client-safe.
 */

export interface SummaryItem {
  id: string;
  status: string;
}

export interface ParsedSummary {
  headline: string;
  items: SummaryItem[];
}

const RECORD_ID = /^[a-z]+_[0-9a-z]+$/i;

/** The headline and one item per record, or null when the summary isn't in that form. */
export function parseActionSummary(summary: string): ParsedSummary | null {
  const colon = summary.indexOf(": ");
  if (colon < 0) return null;
  const headline = summary.slice(0, colon).trim();
  const items: SummaryItem[] = [];
  // Split only where a new record id starts, so a result may itself hold a comma.
  for (const part of summary.slice(colon + 2).split(/,\s+(?=[a-z]+_[0-9a-z]+\s)/i)) {
    const match = /^(\S+)\s+(.+)$/.exec(part.trim());
    if (!match || !RECORD_ID.test(match[1])) return null;
    items.push({ id: match[1], status: match[2].trim() });
  }
  return headline && items.length > 0 ? { headline, items } : null;
}

/** Whether a result needs a person: anything but an active company. */
export function needsAttention(status: string): boolean {
  return !/^active\b/i.test(status);
}

/** Whether the result sends the record to a manager: insolvent, or not checked. */
export function sentToManager(status: string): boolean {
  return /liquidation|administration|dissol|insolv|receiver|couldn/i.test(status);
}

/** "liquidation" → "Liquidation". */
export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
