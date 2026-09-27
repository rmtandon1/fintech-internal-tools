/**
 * A positive integer page from a `?page=` value; anything else is page 1.
 * `Number()` alone accepts "1.5" and "0"; this accepts only whole numbers >= 1.
 */
export function pageNumber(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
