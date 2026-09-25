import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { countPendingFor, countRequestedBy } from "@console/engine/approvals";
import { listAuditEvents } from "@console/engine/audit/query";
import { executeIntent } from "@console/engine/execute-intent";
import { setConstant } from "@console/engine/policy/set-constant";
import { SPEND_FEE_KEY } from "../fixtures/widgets";
import {
  admin,
  kycManager,
  kycReviewer,
  makeWidget,
  otherManager,
  setupHarness,
} from "../helpers/harness";

const HOUR = 60 * 60 * 1000;

function requestSpend(recordId: string, actor = kycReviewer) {
  const result = executeIntent(actor, {
    tool: "widgets",
    action: "spend",
    recordId,
    input: { amount: 500, reason: "needs a manager" },
    idempotencyKey: ulid(),
  });
  if (result.outcome.status !== "pending_approval") {
    throw new Error(`expected approval, got ${result.outcome.status}`);
  }
}

beforeAll(() => {
  setupHarness();
  makeWidget("w_stat_a", 1000);
  makeWidget("w_stat_b", 1000);
  makeWidget("w_stat_c", 1000);
  requestSpend("w_stat_a");
  requestSpend("w_stat_b");
  requestSpend("w_stat_c", kycManager);
});

describe("approval counters", () => {
  it("counts decidable requests within one tool", () => {
    expect(countPendingFor(kycManager, "widgets")).toBe(2);
    expect(countPendingFor(otherManager, "widgets")).toBe(3);
    expect(countPendingFor(kycManager, "vault")).toBe(0);
    expect(countPendingFor(kycManager)).toBe(2);
  });

  it("excludes roles that cannot decide", () => {
    expect(countPendingFor(kycReviewer, "widgets")).toBe(0);
  });

  it("counts pending requests raised by the actor", () => {
    expect(countRequestedBy(kycReviewer, "widgets")).toBe(2);
    expect(countRequestedBy(kycManager, "widgets")).toBe(1);
    expect(countRequestedBy(admin, "widgets")).toBe(0);
    expect(countRequestedBy(kycReviewer, "vault")).toBe(0);
  });
});

describe("audit since filter", () => {
  it("keeps rows at or after the window start and drops older ones", () => {
    setConstant(admin, SPEND_FEE_KEY, "2");
    const all = listAuditEvents({ event: "constant_changed", limit: 1 });
    expect(all.total).toBe(1);
    expect(all.rows[0]?.tool).toBe("widgets");

    expect(listAuditEvents({ event: "constant_changed", since: Date.now() - HOUR }).total).toBe(1);
    expect(listAuditEvents({ event: "constant_changed", since: Date.now() + HOUR }).total).toBe(0);
    expect(
      listAuditEvents({ tool: "widgets", since: Date.now() - HOUR, limit: 0 }).total,
    ).toBeGreaterThan(0);
    expect(listAuditEvents({ tool: "widgets", since: Date.now() + HOUR }).total).toBe(0);
  });
});
