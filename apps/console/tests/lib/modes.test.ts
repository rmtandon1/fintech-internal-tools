import { beforeAll, describe, expect, it } from "vitest";
import { enabledFlagKeys, flagTool } from "@console/tool-flags";
import { allModes, modeEntry, modeIsLive, modesFor, OPS_MODES, type OpsMode } from "@/lib/modes";
import { admin, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  flagTool.seed?.();
});

const kyc = OPS_MODES.find((m) => m.id === "kyc");
if (!kyc) throw new Error("no kyc mode");
const flaggedKyc: OpsMode = { ...kyc, flag: "app.kyc_test" };

describe("modeIsLive", () => {
  it("a flagged mode with a registered tool is off without the key, on with it", () => {
    expect(modeIsLive(flaggedKyc, new Set())).toBe(false);
    expect(modeIsLive(flaggedKyc, new Set(["app.kyc_test"]))).toBe(true);
  });

  it("a mode without a flag is unaffected by the flag set", () => {
    expect(modeIsLive(kyc, new Set())).toBe(true);
    const unbuilt = OPS_MODES.find((m) => m.id === "aml_alerts");
    if (!unbuilt) throw new Error("no aml_alerts mode");
    expect(modeIsLive({ ...unbuilt, flag: "app.aml" }, new Set(["app.aml"]))).toBe(false);
  });
});

describe("ModeEntry.switchedOff", () => {
  it("marks a registered tool whose flag is off, and keeps the roadmap href", () => {
    const off = modeEntry(flaggedKyc, new Set());
    expect(off.live).toBe(false);
    expect(off.switchedOff).toBe(true);
    expect(off.href).toBe("/roadmap/kyc");

    const on = modeEntry(flaggedKyc, new Set(["app.kyc_test"]));
    expect(on.live).toBe(true);
    expect(on.switchedOff).toBe(false);
    expect(on.href).toBe("/t/kyc");

    const neverFlagged = modeEntry(kyc, new Set());
    expect(neverFlagged.live).toBe(true);
    expect(neverFlagged.switchedOff).toBe(false);
  });

  it("modesFor and allModes take the enabled keys", () => {
    for (const entry of modesFor(admin.role, new Set())) {
      expect(entry.switchedOff).toBe(false);
    }
    for (const entry of allModes(new Set())) {
      expect(entry.switchedOff).toBe(false);
    }
  });
});

describe("enabledFlagKeys", () => {
  it("returns the enabled production flag keys and not disabled or non-production ones", () => {
    const keys = enabledFlagKeys();
    expect(keys.has("onboarding.sanctions_rescreen_daily")).toBe(true);
    expect(keys.has("notifications.sms_fallback")).toBe(true);
    expect(keys.has("payments.card_network_failover")).toBe(false);
    expect(keys.has("ledger.double_entry_rewrite")).toBe(false);
  });
});
