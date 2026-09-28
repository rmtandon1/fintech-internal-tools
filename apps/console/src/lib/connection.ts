import type { DevinMode } from "@/lib/devin-status";

/** What `GET /api/status` reports: the services the console depends on. */
export interface ConsoleStatus {
  devin: { mode: DevinMode; error: string | null };
  /** Server time of the check, in ms. */
  checkedAt: number;
}

export type Signal = "ok" | "degraded" | "down";

export interface ConnectionCheck {
  key: "console" | "devin";
  label: string;
  signal: Signal;
  detail: string;
}

/**
 * The indicator rows behind the header status. `reachable` is whether the
 * last poll got an answer; when it did not, the other rows keep the last
 * known state but the console row says the connection dropped.
 */
export function connectionChecks(
  status: ConsoleStatus,
  reachable: boolean,
): ConnectionCheck[] {
  const { devin } = status;
  return [
    {
      key: "console",
      label: "Console",
      signal: reachable ? "ok" : "down",
      detail: reachable ? "Connected" : "Can't reach the server. Retrying…",
    },
    {
      key: "devin",
      label: "Devin",
      signal: devin.mode === "simulation" ? "degraded" : devin.error ? "down" : "ok",
      detail:
        devin.mode === "simulation"
          ? "Not connected: set DEVIN_API_KEY"
          : devin.error
            ? "Can't reach Devin"
            : "Connected",
    },
  ];
}

/** The worst signal wins: one failing service marks the whole pill. */
export function overallSignal(checks: ConnectionCheck[]): Signal {
  if (checks.some((c) => c.signal === "down")) return "down";
  if (checks.some((c) => c.signal === "degraded")) return "degraded";
  return "ok";
}
