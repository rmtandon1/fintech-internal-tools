import { describe, expect, it } from "vitest";
import { formatTimestamp } from "@console/ui/format";
import { factLabel, factValue, type FactLabels } from "@/lib/fact-format";

const KYC: FactLabels = { status: { pending_review: "Pending review" } };
const REFUNDS: FactLabels = {
  status: { executing: "With processor" },
  reasonCode: { not_received: "Not received" },
};

describe("factValue", () => {
  it("uses the declared status label", () => {
    expect(factValue(KYC, "status", "pending_review")).toBe("Pending review");
    expect(factValue(REFUNDS, "status", "executing")).toBe("With processor");
  });

  it("uses the declared enum filter label", () => {
    expect(factValue(REFUNDS, "reasonCode", "not_received")).toBe("Not received");
  });

  it("humanises a coded value with no declared label", () => {
    expect(factValue(KYC, "riskTier", "high")).toBe("High");
    expect(factValue(KYC, "kind", "some_other_code")).toBe("Some other code");
  });

  it("formats minor-unit numbers as dollars", () => {
    expect(factValue(REFUNDS, "usdMinor", 123456)).toBe("$1,234.56");
    expect(factValue(KYC, "riskScore", 68)).toBe("68");
  });

  it("reads booleans and null as words", () => {
    expect(factValue(REFUNDS, "disputed", true)).toBe("yes");
    expect(factValue(REFUNDS, "disputed", false)).toBe("no");
    expect(factValue(REFUNDS, "settledAt", null)).toBe("none");
  });

  it("formats ISO timestamps like the rest of the console", () => {
    const iso = "2025-01-14T09:23:45Z";
    expect(factValue(REFUNDS, "requestedAt", iso)).toBe(formatTimestamp(Date.parse(iso)));
  });

  it("leaves free text and non-codes untouched", () => {
    expect(factValue(KYC, "result", "clear: match (Companies House)")).toBe(
      "clear: match (Companies House)",
    );
    expect(factValue(KYC, "country", "GB")).toBe("GB");
    expect(factValue(KYC, "registrationNumber", "09318842")).toBe("09318842");
  });
});

describe("factLabel", () => {
  it("spells camelCase as words and drops the Minor suffix", () => {
    expect(factLabel("registrationNumber")).toBe("registration number");
    expect(factLabel("usdMinor")).toBe("usd");
    expect(factLabel("status")).toBe("status");
  });
});
