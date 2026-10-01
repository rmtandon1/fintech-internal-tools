import { describe, expect, it } from "vitest";
import { needsAttention, parseActionSummary, sentToManager, statusLabel } from "@/lib/action-summary";

describe("action summary", () => {
  it("reads the recheck's headline and one result per record", () => {
    expect(
      parseActionSummary(
        "Companies House recheck of 4 merchants: kyc_0104 liquidation, kyc_0105 active, kyc_0106 active, kyc_0107 active",
      ),
    ).toEqual({
      headline: "Companies House recheck of 4 merchants",
      items: [
        { id: "kyc_0104", status: "liquidation" },
        { id: "kyc_0105", status: "active" },
        { id: "kyc_0106", status: "active" },
        { id: "kyc_0107", status: "active" },
      ],
    });
  });

  it("keeps a result that holds a comma whole", () => {
    expect(parseActionSummary("Recheck of 2 merchants (test data): kyc_0104 couldn't check (timeout, 5s), kyc_0105 active")?.items).toEqual([
      { id: "kyc_0104", status: "couldn't check (timeout, 5s)" },
      { id: "kyc_0105", status: "active" },
    ]);
  });

  it("leaves a summary that doesn't list records to be shown as text", () => {
    expect(parseActionSummary("No approved UK merchants to recheck")).toBeNull();
    expect(parseActionSummary("Rechecked: all merchants active")).toBeNull();
  });

  it("marks what needs a person and what goes to a manager", () => {
    expect(needsAttention("active")).toBe(false);
    expect(needsAttention("liquidation")).toBe(true);
    expect(sentToManager("liquidation")).toBe(true);
    expect(sentToManager("couldn't check (timeout)")).toBe(true);
    expect(sentToManager("active")).toBe(false);
    expect(statusLabel("liquidation")).toBe("Liquidation");
  });
});
