/**
 * Geometry and motion for the score gauge, kept free of React so it can be
 * tested and reused. Angles are SVG degrees: 0 points right, positive turns
 * clockwise, so the horseshoe opens downward.
 */

/** Where the horseshoe starts (bottom left) and how far it turns. */
export const GAUGE_START = 150;
export const GAUGE_SWEEP = 240;

export type GaugeTone = "positive" | "caution" | "warning" | "negative";

/**
 * One stretch of the scale. `from` is inclusive, `to` exclusive, except that
 * the last band also holds the scale's maximum.
 */
export interface GaugeBand {
  from: number;
  to: number;
  tone: GaugeTone;
  label: string;
}

/** Mid-lightness inks that read on both the dark and the light canvas. */
export const TONE_INK: Record<GaugeTone, string> = {
  positive: "oklch(0.72 0.17 152)",
  caution: "oklch(0.84 0.16 92)",
  warning: "oklch(0.75 0.17 55)",
  negative: "oklch(0.65 0.22 25)",
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The angle a value sits at on a `min..max` scale. */
export function angleFor(value: number, min: number, max: number): number {
  const span = max - min || 1;
  return GAUGE_START + (GAUGE_SWEEP * (clamp(value, min, max) - min)) / span;
}

export function pointAt(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** A clockwise arc from angle `a` to angle `b`; empty when `b <= a`. */
export function arcPath(cx: number, cy: number, r: number, a: number, b: number): string {
  if (b <= a) return "";
  const start = pointAt(cx, cy, r, a);
  const end = pointAt(cx, cy, r, b);
  const large = b - a > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return `M ${f(start.x)} ${f(start.y)} A ${r} ${r} 0 ${large} 1 ${f(end.x)} ${f(end.y)}`;
}

/** The band a value falls in; the top band holds the maximum. */
export function bandFor<T extends GaugeBand>(bands: readonly T[], value: number): T | undefined {
  const inside = bands.find((b) => value >= b.from && value < b.to);
  if (inside) return inside;
  const last = bands.at(-1);
  return last && value >= last.to ? last : undefined;
}

/**
 * Ease out with a small overshoot, so the needle swings a little past the
 * value and settles back onto it. `swing(0) = 0`, `swing(1) = 1`.
 */
export function swing(t: number, overshoot = 1.1): number {
  const u = clamp(t, 0, 1) - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}
