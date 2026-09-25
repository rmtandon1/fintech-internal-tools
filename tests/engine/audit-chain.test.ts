import { beforeAll, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { sqlite } from "@/db/client";
import { executeIntent } from "@/engine/execute-intent";
import { verifyChain } from "@/engine/audit/verify";
import { kycReviewer, makeWidget, setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
  makeWidget("w_audit", 1000);
  for (const amount of [1, 2, 3]) {
    executeIntent(kycReviewer, {
      tool: "widgets",
      action: "spend",
      recordId: "w_audit",
      input: { amount, reason: "audit fixture" },
      idempotencyKey: ulid(),
    });
  }
});

describe("audit chain", () => {
  it("verifies a chain written by the engine", () => {
    const result = verifyChain();
    expect(result.ok).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.firstBreak).toBeNull();
  });

  it("detects a deleted row as a sequence gap", () => {
    const row = sqlite.prepare("SELECT * FROM audit_log WHERE seq = 2").get() as Record<
      string,
      unknown
    >;
    sqlite.exec("DELETE FROM audit_log WHERE seq = 2");
    const result = verifyChain();
    sqlite
      .prepare(
        `INSERT INTO audit_log (seq, id, ts, actor_id, actor_role, tool, action, record_type,
          record_id, event, summary, payload_json, before_json, after_json, decision_json,
          prev_hash, row_hash)
         VALUES (@seq, @id, @ts, @actor_id, @actor_role, @tool, @action, @record_type,
          @record_id, @event, @summary, @payload_json, @before_json, @after_json,
          @decision_json, @prev_hash, @row_hash)`,
      )
      .run(row);

    expect(result.ok).toBe(false);
    expect(result.firstBreak?.type).toBe("seq_gap");
    expect(verifyChain().ok).toBe(true);
  });

  it("detects an altered row as a row hash mismatch", () => {
    const { summary } = sqlite
      .prepare("SELECT summary FROM audit_log WHERE seq = 2")
      .get() as { summary: string };

    sqlite.prepare("UPDATE audit_log SET summary = 'tampered' WHERE seq = 2").run();
    const result = verifyChain();
    sqlite.prepare("UPDATE audit_log SET summary = ? WHERE seq = 2").run(summary);

    expect(result.ok).toBe(false);
    expect(result.firstBreak?.type).toBe("row_hash_mismatch");
    expect(result.firstBreak?.seq).toBe(2);
    expect(verifyChain().ok).toBe(true);
  });

  it("detects a deleted tail against the head checkpoint", () => {
    const last = sqlite
      .prepare("SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1")
      .get() as Record<string, unknown>;

    // Deleting the tail leaves an internally consistent chain; only the head
    // checkpoint shows that a row is missing.
    sqlite.prepare("DELETE FROM audit_log WHERE seq = ?").run(last.seq);
    const result = verifyChain();
    sqlite
      .prepare(
        `INSERT INTO audit_log (seq, id, ts, actor_id, actor_role, tool, action, record_type,
          record_id, event, summary, payload_json, before_json, after_json, decision_json,
          prev_hash, row_hash)
         VALUES (@seq, @id, @ts, @actor_id, @actor_role, @tool, @action, @record_type,
          @record_id, @event, @summary, @payload_json, @before_json, @after_json,
          @decision_json, @prev_hash, @row_hash)`,
      )
      .run(last);

    expect(result.ok).toBe(false);
    expect(result.firstBreak?.type).toBe("head_mismatch");
    expect(verifyChain().ok).toBe(true);
  });

  it("detects a rewritten link as a prev hash mismatch", () => {
    const original = sqlite
      .prepare("SELECT prev_hash AS prev, row_hash AS row FROM audit_log WHERE seq = 3")
      .get() as { prev: string; row: string };

    sqlite
      .prepare("UPDATE audit_log SET prev_hash = ? WHERE seq = 3")
      .run("forged-previous-hash");
    const result = verifyChain();
    sqlite.prepare("UPDATE audit_log SET prev_hash = ? WHERE seq = 3").run(original.prev);

    expect(result.ok).toBe(false);
    expect(result.firstBreak?.type).toBe("prev_mismatch");
    expect(verifyChain().ok).toBe(true);
  });
});
