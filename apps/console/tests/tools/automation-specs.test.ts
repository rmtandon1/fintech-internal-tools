import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANIES_HOUSE_CHECK, REFUND_CLUSTERING_HOLD, SPECS } from "@console/tool-automation";
import { CLUSTERING_WINDOW_DAYS_KEY } from "@console/tool-refunds";

const SENTENCE =
  "Recheck approved UK merchants against Companies House every day. When one enters administration, liquidation or dissolution, send it and its refunds to a Manager, and link each refund to its merchant's case.";
const CHECKLIST_LINE =
  "A refund links to its merchant's case, and the case lists the merchant's refunds (linkedActivity).";

describe("automation specs", () => {
  it("names the setting each change is switched on with", () => {
    expect(REFUND_CLUSTERING_HOLD.switchSetting).toBe(CLUSTERING_WINDOW_DAYS_KEY);
    expect(REFUND_CLUSTERING_HOLD.switchSetting).toBe("refunds.clustering_window_days");
    expect(COMPANIES_HOUSE_CHECK.switchSetting).toBe("kyc.merchant_monitoring");
    for (const spec of SPECS) {
      if (spec.switchSetting) expect(spec.switchSetting.startsWith(`${spec.tool}.`)).toBe(true);
    }
  });

  it("suggests the Companies House sentence and checks the refund–case link both ways", () => {
    expect(COMPANIES_HOUSE_CHECK.intents.change).toBe(SENTENCE);
    expect(COMPANIES_HOUSE_CHECK.acceptance.change).toContain(CHECKLIST_LINE);
    const doc = readFileSync(join(__dirname, "../../../../docs", COMPANIES_HOUSE_CHECK.file), "utf8").replace(/\n> ?/g, " ").replace(/\n {2}/g, " ");
    expect(doc).toContain(SENTENCE);
    expect(doc).toContain(CHECKLIST_LINE);
  });
});
