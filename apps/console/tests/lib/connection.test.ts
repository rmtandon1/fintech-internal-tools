import { describe, expect, it } from "vitest";
import { connectionChecks, overallSignal, type ConsoleStatus } from "@/lib/connection";

const LIVE: ConsoleStatus = {
  devin: { mode: "live", error: null },
  audit: { ok: true, length: 1204 },
  checkedAt: 0,
};

const signals = (status: ConsoleStatus, reachable = true) =>
  Object.fromEntries(connectionChecks(status, reachable).map((c) => [c.key, c.signal]));

describe("connection status", () => {
  it("is all green when the console answers, Devin is live and the audit log verifies", () => {
    const checks = connectionChecks(LIVE, true);
    expect(signals(LIVE)).toEqual({ console: "ok", devin: "ok", audit: "ok" });
    expect(overallSignal(checks)).toBe("ok");
    expect(checks.find((c) => c.key === "audit")?.detail).toBe("Verified · 1,204 entries");
  });

  it("marks simulation mode as degraded, not down", () => {
    const status = { ...LIVE, devin: { mode: "simulation" as const, error: null } };
    expect(signals(status).devin).toBe("degraded");
    expect(overallSignal(connectionChecks(status, true))).toBe("degraded");
  });

  it("marks an unreachable Devin key or a broken audit chain as down", () => {
    expect(signals({ ...LIVE, devin: { mode: "live", error: "401" } }).devin).toBe("down");
    const broken = { ...LIVE, audit: { ok: false, length: 3 } };
    expect(signals(broken).audit).toBe("down");
    expect(overallSignal(connectionChecks(broken, true))).toBe("down");
  });

  it("keeps the last known service state when a poll fails, and flags the console", () => {
    const checks = connectionChecks(LIVE, false);
    expect(signals(LIVE, false)).toEqual({ console: "down", devin: "ok", audit: "ok" });
    expect(overallSignal(checks)).toBe("down");
  });

  it("never puts error text from the Devin check on screen", () => {
    const status = { ...LIVE, devin: { mode: "live" as const, error: "fetch failed: ECONNREFUSED" } };
    const devin = connectionChecks(status, true).find((c) => c.key === "devin");
    expect(devin?.detail).toBe("Can't reach Devin");
  });
});
