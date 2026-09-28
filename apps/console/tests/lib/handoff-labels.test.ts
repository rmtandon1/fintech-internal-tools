import { describe, expect, it } from "vitest";
import { evidenceLabels } from "@/lib/handoff";

describe("evidenceLabels", () => {
  it("maps statuses and enum filter options for the evidence tool", () => {
    expect(evidenceLabels("kyc").status.pending_review).toBe("Pending review");
    expect(evidenceLabels("refunds").reasonCode.not_received).toBe("Not received");
    expect(evidenceLabels("refunds").status.executing).toBe("With processor");
  });

  it("is empty for evidence that names no tool", () => {
    expect(evidenceLabels("roadmap")).toEqual({});
  });
});
