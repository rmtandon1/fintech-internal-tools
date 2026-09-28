import { describe, expect, it } from "vitest";
import { connectionChecks, overallSignal, type ConsoleStatus } from "@/lib/connection";

const LIVE: ConsoleStatus = {
  devin: { mode: "live", error: null },
  checkedAt: 0,
};

const signals = (status: ConsoleStatus, reachable = true) =>
  Object.fromEntries(connectionChecks(status, reachable).map((c) => [c.key, c.signal]));

describe("connection status", () => {
  it("is all green when the console answers and Devin is live", () => {
    const checks = connectionChecks(LIVE, true);
    expect(signals(LIVE)).toEqual({ console: "ok", devin: "ok" });
    expect(overallSignal(checks)).toBe("ok");
  });

  it("marks simulation mode as degraded, not down", () => {
    const status = { ...LIVE, devin: { mode: "simulation" as const, error: null } };
    expect(signals(status).devin).toBe("degraded");
    expect(overallSignal(connectionChecks(status, true))).toBe("degraded");
  });

  it("marks an unreachable Devin key as down", () => {
    const status = { ...LIVE, devin: { mode: "live" as const, error: "401" } };
    expect(signals(status).devin).toBe("down");
    expect(overallSignal(connectionChecks(status, true))).toBe("down");
  });

  it("keeps the last known service state when a poll fails, and flags the console", () => {
    const checks = connectionChecks(LIVE, false);
    expect(signals(LIVE, false)).toEqual({ console: "down", devin: "ok" });
    expect(overallSignal(checks)).toBe("down");
  });

  it("never puts error text from the Devin check on screen", () => {
    const status = { ...LIVE, devin: { mode: "live" as const, error: "fetch failed: ECONNREFUSED" } };
    const devin = connectionChecks(status, true).find((c) => c.key === "devin");
    expect(devin?.detail).toBe("Can't reach Devin");
  });
});
