import { beforeAll, describe, expect, it } from "vitest";
import { listAuditEvents } from "@console/engine/audit/query";
import { maskRecord } from "@console/engine/pii/mask";
import { revealField } from "@console/engine/pii/reveal";
import { widgetTool } from "../fixtures/widgets";
import { kycReviewer, makeWidget, kycManager, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  makeWidget("w_pii", 100);
});

describe("pii", () => {
  it("masks declared personal fields at the read boundary", () => {
    const record = widgetTool.get("w_pii");
    if (!record) throw new Error("missing fixture");

    const masked = maskRecord(widgetTool, record, kycReviewer);

    expect(masked.values.ownerEmail).not.toContain("w_pii@example.com");
    expect(masked.maskedFields).toEqual(["ownerEmail"]);
    expect(masked.values.balance).toBe(100);
  });

  it("refuses to reveal for a role without the permission", () => {
    const result = revealField(kycReviewer, "widgets", "w_pii", "ownerEmail");
    expect(result.ok).toBe(false);
  });

  it("refuses to reveal on a tool the role cannot see, whatever the reveal roles say", () => {
    const result = revealField(kycReviewer, "vault", "w_pii", "ownerEmail");

    expect(result).toMatchObject({ ok: false });
  });

  it("reveals for a permitted role and audits the reveal", () => {
    const result = revealField(kycManager, "widgets", "w_pii", "ownerEmail");

    expect(result).toMatchObject({ ok: true, value: "w_pii@example.com" });
    const { rows } = listAuditEvents({ event: "pii_revealed" });
    expect(rows[0]?.recordId).toBe("w_pii");
    expect(rows[0]?.actorId).toBe(kycManager.id);
  });
});
