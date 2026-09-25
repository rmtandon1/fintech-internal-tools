"use client";

import { useEffect, useState } from "react";
import { easeOutCubic } from "./gauge";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Tweens from `from` to `to` once mounted, and again whenever `to` changes.
 * The server render and the first client render show `from`; with reduced
 * motion the value jumps straight to `to`.
 */
export function useTween(
  to: number,
  {
    from = 0,
    durationMs = 1200,
    delayMs = 0,
    ease = easeOutCubic,
  }: {
    from?: number;
    durationMs?: number;
    delayMs?: number;
    ease?: (t: number) => number;
  } = {},
): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setValue(from + (to - from) * ease(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, from, durationMs, delayMs, ease]);

  return value;
}

/** A number that counts up to `value` when it mounts. */
export function CountUp({
  value,
  format,
  durationMs = 1200,
  delayMs = 0,
  className,
}: {
  value: number;
  format?: Intl.NumberFormatOptions;
  durationMs?: number;
  delayMs?: number;
  className?: string;
}) {
  const current = useTween(value, { durationMs, delayMs });
  const shown = current >= value ? value : current;
  return (
    <span className={className}>
      {new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, ...format }).format(shown)}
    </span>
  );
}
