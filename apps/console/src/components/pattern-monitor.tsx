"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";

export interface PatternFinding {
  key: string;
  headline: string;
  detail?: string;
  href: string;
}

/** How long after the page opens the monitor window slides up. */
const APPEAR_MS = 2500;
/** The gap between each line the monitor prints. */
const LINE_MS = 700;

/**
 * A small window docked bottom-right that reports what the queue monitor
 * found. It opens a moment after the page does and prints its checks one by
 * one before naming the pattern, so the finding reads as something the
 * console noticed rather than a banner that was always there. Once seen in
 * this browser session it comes back minimised instead of replaying.
 */
export function PatternMonitor({
  toolName,
  scanned,
  looksFor,
  findings,
}: {
  /** The tool's display name, e.g. "Refunds". */
  toolName: string;
  /** How many records the queue holds. */
  scanned: number;
  /** One line per pattern the monitor checks for. */
  looksFor: string[];
  findings: PatternFinding[];
}) {
  const storageKey = `pattern-monitor:${toolName}:${findings.map((f) => f.key).join("|")}`;
  const noun = toolName.toLowerCase();
  const lines = [
    `Watching the ${noun} queue`,
    `Checked ${scanned} ${noun}`,
    ...looksFor.map((pattern) => `Looking for: ${pattern.charAt(0).toLowerCase()}${pattern.slice(1)}`),
  ];

  const [state, setState] = useState<"hidden" | "open" | "minimised">("hidden");
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (findings.length === 0) return;
    if (readSeen(storageKey)) {
      setState("minimised");
      setShown(lines.length + 1);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setState("open"), APPEAR_MS));
    for (let i = 1; i <= lines.length + 1; i++) {
      timers.push(setTimeout(() => setShown(i), APPEAR_MS + i * LINE_MS));
    }
    timers.push(
      setTimeout(() => writeSeen(storageKey), APPEAR_MS + (lines.length + 1) * LINE_MS),
    );
    return () => timers.forEach(clearTimeout);
    // The script is fixed for a given set of findings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  if (findings.length === 0 || state === "hidden") return null;

  const done = shown > lines.length;

  if (state === "minimised") {
    return (
      <button
        type="button"
        onClick={() => setState("open")}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-amber-500/50 bg-card px-4 py-2 text-sm font-medium shadow-lg hover:border-amber-500"
        data-testid="pattern-monitor-pill"
      >
        <span className="size-2 rounded-full bg-amber-400" />
        {findings.length === 1 ? "1 pattern found" : `${findings.length} patterns found`}
      </button>
    );
  }

  return (
    <aside
      className="fixed right-4 bottom-4 z-40 w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-[#0b0d10] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500"
      data-testid="pattern-monitor"
      aria-live="polite"
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span
          className={cn(
            "size-2 rounded-full",
            done ? "bg-amber-400" : "animate-pulse bg-emerald-400",
          )}
        />
        <span className="text-sm font-medium text-white">Pattern monitor</span>
        <span className="text-xs text-white/50">· {toolName}</span>
        <button
          type="button"
          onClick={() => {
            writeSeen(storageKey);
            setState("minimised");
          }}
          aria-label="Minimise"
          className="ml-auto rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <Icon name="Minus" className="size-4" />
        </button>
      </header>

      <ol className="space-y-1.5 px-4 py-3 font-mono text-[13px] leading-5">
        {lines.slice(0, shown).map((line) => (
          <li key={line} className="flex gap-2 text-white/75 animate-in fade-in duration-300">
            <span className="text-emerald-400">✓</span>
            {line}
          </li>
        ))}
        {!done ? (
          <li className="flex gap-2 text-white/50">
            <span className="animate-pulse">›</span>
            <span className="animate-pulse">scanning…</span>
          </li>
        ) : null}
      </ol>

      {done ? (
        <div className="space-y-3 border-t border-white/10 px-4 py-3 animate-in fade-in slide-in-from-bottom-1 duration-500">
          {findings.map((finding) => (
            <div key={finding.key} className="space-y-2">
              <div className="flex items-start gap-2">
                <Icon name="TriangleAlert" className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{finding.headline}</p>
                  {finding.detail ? (
                    <p className="mt-0.5 text-[13px] leading-relaxed text-white/60">
                      {finding.detail}
                    </p>
                  ) : null}
                </div>
              </div>
              <Link
                href={finding.href}
                onClick={() => {
                  writeSeen(storageKey);
                  setState("minimised");
                }}
                className="ml-6 inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-400 px-3 text-sm font-medium text-black hover:bg-amber-300"
              >
                Take a look
                <Icon name="ArrowRight" className="size-4" />
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function readSeen(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}

function writeSeen(key: string): void {
  try {
    window.sessionStorage.setItem(key, "seen");
  } catch {
    // Storage can be unavailable (private mode); the monitor then replays.
  }
}
