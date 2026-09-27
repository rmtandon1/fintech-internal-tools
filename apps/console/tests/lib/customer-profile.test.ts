import { describe, expect, it } from "vitest";
import { GAUGE_START, GAUGE_SWEEP, angleFor, arcPath, bandFor, swing } from "@console/ui/gauge";
import {
  approvalNeed,
  countryName,
  customerFacts,
  dueLabel,
  flagEmoji,
  initials,
  riskBands,
} from "@/lib/customer-profile";

const HOUR = 60 * 60 * 1000;
const thresholds = { manager: 70, admin: 85 };

describe("score gauge geometry", () => {
  it("maps the scale onto the horseshoe and clamps outside it", () => {
    expect(angleFor(0, 0, 100)).toBe(GAUGE_START);
    expect(angleFor(100, 0, 100)).toBe(GAUGE_START + GAUGE_SWEEP);
    expect(angleFor(50, 0, 100)).toBe(270);
    expect(angleFor(-10, 0, 100)).toBe(GAUGE_START);
    expect(angleFor(140, 0, 100)).toBe(GAUGE_START + GAUGE_SWEEP);
  });

  it("draws no arc for an empty span and a large arc past 180 degrees", () => {
    expect(arcPath(100, 100, 80, 200, 200)).toBe("");
    expect(arcPath(100, 100, 80, 150, 390)).toContain(" 0 1 1 ");
    expect(arcPath(100, 100, 80, 150, 270)).toContain(" 0 0 1 ");
  });

  it("swings past the value and lands exactly on it", () => {
    expect(swing(0)).toBe(0);
    expect(swing(1)).toBe(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => swing(i / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
  });
});

describe("risk bands", () => {
  it("puts the colour changes on the live approval thresholds", () => {
    const bands = riskBands(thresholds);
    expect(bands.map((b) => [b.from, b.to, b.tone])).toEqual([
      [0, 40, "positive"],
      [40, 70, "caution"],
      [70, 85, "warning"],
      [85, 100, "negative"],
    ]);
    expect(bandFor(bands, 69)?.tone).toBe("caution");
    expect(bandFor(bands, 70)?.tone).toBe("warning");
    expect(bandFor(bands, 85)?.tone).toBe("negative");
    expect(bandFor(bands, 100)?.tone).toBe("negative");
  });

  it("follows a threshold an admin has moved", () => {
    const bands = riskBands({ manager: 60, admin: 90 });
    expect(bandFor(bands, 65)?.label).toBe("High risk");
    expect(bandFor(bands, 89)?.label).toBe("High risk");
    expect(riskBands({ manager: 30, admin: 50 })[0]).toMatchObject({ from: 0, to: 30 });
  });

  it("says who approves, matching the risk_tier_approval rule", () => {
    expect(approvalNeed(69, thresholds).text).toBe("Any reviewer can approve this case.");
    expect(approvalNeed(70, thresholds).text).toMatch(/^A manager approves/);
    expect(approvalNeed(85, thresholds).text).toMatch(/^An admin approves/);
  });
});

describe("customer card copy", () => {
  it("reads the SLA as a deadline", () => {
    const now = 1_000 * HOUR;
    expect(dueLabel(now + 28 * HOUR, now)).toEqual({ tone: "neutral", text: "Due in 28h" });
    expect(dueLabel(now + 5 * HOUR, now)).toEqual({ tone: "warning", text: "Due in 5h" });
    expect(dueLabel(now - 3 * 24 * HOUR, now)).toEqual({ tone: "negative", text: "Overdue by 3d" });
    expect(dueLabel(now + 20_000, now).text).toBe("Due in 1m");
  });

  it("names the country and draws its flag", () => {
    expect(flagEmoji("GB")).toBe("🇬🇧");
    expect(flagEmoji("gb")).toBe("🇬🇧");
    expect(flagEmoji("GBR")).toBe("");
    expect(countryName("GB")).toBe("United Kingdom");
  });

  it("takes initials from a person or a company", () => {
    expect(initials("Helena Vasquez")).toBe("HV");
    expect(initials("Northwind Freight Ltd")).toBe("NF");
    expect(initials("Caspian Trading FZE")).toBe("CT");
  });

  it("reads a case's facts and refuses a record that is not one", () => {
    const record = {
      id: "kyc_1",
      version: 1,
      customerName: "Helena Vasquez",
      country: "ES",
      segment: "consumer",
      documentType: "passport",
      riskScore: 18,
      sanctionsHit: 0,
      documentsComplete: 1,
      openedAt: 1,
      dueAt: 2,
    };
    expect(customerFacts(record)).toMatchObject({
      riskScore: 18,
      sanctionsHit: false,
      documentsComplete: true,
    });
    expect(customerFacts({ ...record, riskScore: "18" })).toBeNull();
    expect(customerFacts({ id: "ref_1", version: 1 })).toBeNull();
  });
});
