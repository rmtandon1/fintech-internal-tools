"use client";

import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@console/ui/dropdown-menu";
import { cn } from "@console/ui/utils";
import {
  connectionChecks,
  overallSignal,
  type ConsoleStatus,
  type Signal,
} from "@/lib/connection";

const POLL_MS = 10_000;

const DOT: Record<Signal, string> = {
  ok: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
};

const PILL: Record<Signal, { label: string; className: string }> = {
  ok: { label: "All systems live", className: "text-success" },
  degraded: { label: "Partly live", className: "text-warning" },
  down: { label: "Connection issue", className: "text-destructive" },
};

/**
 * Header indicator for the services the console depends on. Polls
 * `/api/status` every ten seconds, and at once when the browser comes back
 * online or the tab regains focus; the dot pulses while the console is reachable.
 */
export function ConnectionStatus({ initial }: { initial: ConsoleStatus }) {
  const [status, setStatus] = useState(initial);
  const [reachable, setReachable] = useState(true);
  const [lastOk, setLastOk] = useState(initial.checkedAt);
  const [now, setNow] = useState(initial.checkedAt);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setReachable(false);
        return;
      }
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as ConsoleStatus;
        if (cancelled) return;
        setStatus(next);
        setReachable(true);
        setLastOk(Date.now());
      } catch {
        if (!cancelled) setReachable(false);
      }
    }
    function onOffline() {
      setReachable(false);
    }
    function onVisible() {
      if (document.visibilityState === "visible") void poll();
    }
    void poll();
    const pollId = setInterval(poll, POLL_MS);
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("online", poll);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(tickId);
      window.removeEventListener("online", poll);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const checks = connectionChecks(status, reachable);
  const overall = overallSignal(checks);
  const pill = PILL[overall];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-7 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid="connection-status"
        data-signal={overall}
      >
        <Dot signal={overall} pulse />
        <span className={cn("hidden font-medium sm:inline", pill.className)}>{pill.label}</span>
        <span className="flex items-center gap-1" aria-hidden>
          {checks.map((check) => (
            <span key={check.key} className={cn("size-1.5 rounded-full", DOT[check.signal])} />
          ))}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1">
        <DropdownMenuLabel className="text-xs">Connection status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ul className="space-y-0.5 py-1">
          {checks.map((check) => (
            <li key={check.key} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-xs">
              <Dot signal={check.signal} />
              <span className="font-medium">{check.label}</span>
              <span className="ml-auto truncate text-muted-foreground">{check.detail}</span>
            </li>
          ))}
        </ul>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
          {reachable ? "Checked" : "Last answer"} {ago(now - lastOk)} · every 10 seconds
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Dot({ signal, pulse = false }: { signal: Signal; pulse?: boolean }) {
  return (
    <span className="relative flex size-2">
      {pulse && signal !== "down" ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-60",
            DOT[signal],
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-2 rounded-full", DOT[signal])} />
    </span>
  );
}

function ago(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}
