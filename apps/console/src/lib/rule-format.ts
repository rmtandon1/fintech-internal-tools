/** How a rule's values read on screen; no server imports, so client components can use it. */

/** `$500.00`: a `usd_minor` setting as operators read it. */
export function formatUsdMinor(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** `30 Sept 2026`: the day something happened, without the time. */
export function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
