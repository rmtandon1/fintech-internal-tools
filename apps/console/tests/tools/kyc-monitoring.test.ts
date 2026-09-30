import { beforeAll, describe, expect, it } from "vitest";
import { registerConstants } from "@console/engine/policy/register";
import { COMPANIES_HOUSE_CHECK } from "@console/tool-automation";
import { buildContext } from "@console/tool-automation/context";
import {
  kycTool,
  UNMONITORED_MERCHANTS_CLUSTER,
  UNMONITORED_MERCHANTS_KEY,
  companyNumber,
  unmonitoredMerchants,
} from "@console/tool-kyc";
import { setupHarness } from "../helpers/harness";

const CASES = ["kyc_0104", "kyc_0105", "kyc_0106", "kyc_0107"];

beforeAll(() => {
  setupHarness();
  registerConstants(kycTool.constants ?? []);
  kycTool.seed?.();
});

describe("unmonitored merchants", () => {
  it("is one finding: the four approved UK merchants checked by hand in 2021 and never since", () => {
    const [group, ...rest] = unmonitoredMerchants(Date.UTC(2026, 8, 30));
    expect(rest).toEqual([]);
    expect(group).toMatchObject({
      key: UNMONITORED_MERCHANTS_KEY,
      count: 4,
      headline: "4 approved UK merchants haven't been rechecked since onboarding",
      detail: "Checked by hand once, in 2021. UK rules expect ongoing monitoring.",
    });
    expect([...group.recordIds].sort()).toEqual(CASES);
    // The cluster hands off to the Companies House check and shows each merchant's registration.
    const cluster = kycTool.clusters?.find((c) => c.id === UNMONITORED_MERCHANTS_CLUSTER);
    expect(cluster?.handoffSpec).toBe(COMPANIES_HOUSE_CHECK.file);
    expect(cluster?.noun).toBe("merchants");
    const wilko = kycTool.get("kyc_0104")!;
    expect(cluster?.rowFacts?.(wilko)).toEqual([
      { label: "Company number", value: "00365335" },
      { label: "Last checked", value: expect.stringMatching(/2021$/) },
    ]);
    expect(companyNumber("GB00365335")).toBe("00365335");
  });

  it("carries every merchant in the group as evidence, and nothing outside it", () => {
    const built = buildContext({
      runId: "01TEST",
      operation: "change",
      spec: COMPANIES_HOUSE_CHECK,
      intent: COMPANIES_HOUSE_CHECK.intents.change,
      requestedBy: "manager",
      evidenceKey: UNMONITORED_MERCHANTS_KEY,
      evidenceIds: CASES,
    });
    expect(built.context.evidence.source).toBe(`kyc:${UNMONITORED_MERCHANTS_KEY}`);
    expect(built.context.evidence.rows.map((row) => row.id)).toEqual(CASES);
    for (const row of built.context.evidence.rows) {
      expect(Object.keys(row)).not.toContain("dateOfBirth");
      expect(Object.keys(row)).not.toContain("email");
    }
    expect(() =>
      buildContext({
        runId: "01TEST",
        operation: "change",
        spec: COMPANIES_HOUSE_CHECK,
        intent: COMPANIES_HOUSE_CHECK.intents.change,
        requestedBy: "manager",
        evidenceKey: UNMONITORED_MERCHANTS_KEY,
        evidenceIds: [...CASES, "kyc_0003"],
      }),
    ).toThrow(/not in approved_uk_merchants/);
  });
});
