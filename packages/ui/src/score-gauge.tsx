"use client";

import {
  GAUGE_START,
  GAUGE_SWEEP,
  TONE_INK,
  angleFor,
  arcPath,
  bandFor,
  clamp,
  pointAt,
  swing,
  type GaugeBand,
} from "./gauge";
import { useTween } from "./motion";
import { cn } from "./utils";

const SIZE = 200;
const CX = 100;
const CY = 100;
const R = 80;
const STROKE = 13;
/** Degrees left empty between bands, so each threshold reads as a notch. */
const GAP = 2;

/**
 * A horseshoe gauge for a bounded score. The scale is drawn in coloured
 * bands; on mount the arc fills from the minimum, swings a little past the
 * value and settles, while the number in the middle counts up. The knob and
 * the number use the foreground colour, so they read white on the dark theme
 * and black on the light one.
 */
export function ScoreGauge({
  value,
  bands,
  min = 0,
  max = 100,
  label,
  className,
}: {
  value: number;
  bands: GaugeBand[];
  min?: number;
  max?: number;
  /** Read out with the value, e.g. "Risk score". */
  label: string;
  className?: string;
}) {
  const target = clamp(value, min, max);
  const current = useTween(target, { from: min, durationMs: 1700, delayMs: 150, ease: swing });
  const shown = Math.round(Math.min(current, target));
  const drawn = clamp(current, min, max);
  const band = bandFor(bands, target);
  // The tween ends exactly on its target; mid-swing it only passes through.
  const landed = current === target;
  const ink = band ? TONE_INK[band.tone] : "currentColor";
  const knob = pointAt(CX, CY, R, angleFor(drawn, min, max));
  const first = bands[0];
  const last = bands.at(-1);

  return (
    <div
      className={cn("relative aspect-[200/166] w-full max-w-[220px]", className)}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={target}
      aria-valuetext={band ? `${target}, ${band.label}` : String(target)}
    >
      <svg viewBox={`0 0 ${SIZE} 166`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        {bands.map((b) => {
          const a = angleFor(b.from, min, max) + (b === first ? 0 : GAP / 2);
          const z = angleFor(b.to, min, max) - (b === last ? 0 : GAP / 2);
          const fillEnd = Math.min(z, angleFor(drawn, min, max));
          return (
            <g key={`${b.from}-${b.to}`}>
              <path
                d={arcPath(CX, CY, R, a, z)}
                fill="none"
                stroke={TONE_INK[b.tone]}
                strokeOpacity={0.16}
                strokeWidth={STROKE}
                strokeLinecap={b === first || b === last ? "round" : "butt"}
              />
              <path
                d={arcPath(CX, CY, R, a, fillEnd)}
                fill="none"
                stroke={TONE_INK[b.tone]}
                strokeWidth={STROKE}
                strokeLinecap={b === first ? "round" : "butt"}
                style={{ filter: `drop-shadow(0 0 3px color-mix(in oklch, ${TONE_INK[b.tone]} 45%, transparent))` }}
                opacity={0.95}
              />
            </g>
          );
        })}
        <circle
          cx={knob.x}
          cy={knob.y}
          r={STROKE / 2 + 3}
          className="fill-background stroke-foreground"
          strokeWidth={3.5}
        />
        <ScaleLabel angle={GAUGE_START} text={String(min)} />
        <ScaleLabel angle={GAUGE_START + GAUGE_SWEEP} text={String(max)} />
      </svg>
      <div className="absolute inset-x-0 top-[30%] flex flex-col items-center">
        <span className="text-[44px] leading-none font-semibold tracking-tight tabular-nums text-foreground">
          {shown}
        </span>
        {band ? (
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground transition-opacity duration-500",
              landed ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="size-2 rounded-full" style={{ background: ink }} />
            {band.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ScaleLabel({ angle, text }: { angle: number; text: string }) {
  const p = pointAt(CX, CY, R, angle);
  return (
    <text
      x={p.x}
      y={p.y + STROKE + 8}
      textAnchor="middle"
      className="fill-muted-foreground text-[11px] tabular-nums"
    >
      {text}
    </text>
  );
}
