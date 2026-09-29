import { asc } from "drizzle-orm";
import { auditLog, approvalRequests } from "@console/db-core/engine-schema";
import { db } from "@console/db";
import { sqlite } from "@console/db-core";
import { canonicalJson } from "@console/engine/audit/canonical";
import { computeRowHash, GENESIS_HASH } from "@console/engine/audit/chain";
import { verifyChain } from "@console/engine/audit/verify";
import { eq } from "drizzle-orm";

const ROLE_REMAP: Record<string, string> = {
  kyc_reviewer: "analyst",
  refunds_agent: "analyst",
  kyc_manager: "manager",
  refunds_manager: "manager",
};

const ACTOR_REMAP: Record<string, string> = {
  usr_kyc_reviewer: "usr_analyst",
  usr_refunds_agent: "usr_analyst",
  usr_kyc_manager: "usr_manager",
  usr_refunds_manager: "usr_manager",
  usr_kyc_manager_2: "usr_manager",
};

function remapJson(value: unknown): unknown {
  if (typeof value === "string") return ROLE_REMAP[value] ?? value;
  if (Array.isArray(value)) {
    const mapped = value.map(remapJson);
    if (
      mapped.every((item) => typeof item === "string") &&
      mapped.some((item) => item === "manager")
    ) {
      return [...new Set(mapped)];
    }
    return mapped;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, remapJson(item)]),
    );
  }
  return value;
}

function remapJsonText(json: string): string {
  return canonicalJson(remapJson(JSON.parse(json)));
}

/** Rewrites JSON role values and rehashes any affected audit history. */
export function migratePersistedRoleJson(): void {
  const approvals = db.select().from(approvalRequests).all();
  for (const approval of approvals) {
    const traceJson = remapJsonText(approval.traceJson);
    const decisionJson = remapJsonText(approval.decisionJson);
    if (traceJson !== approval.traceJson || decisionJson !== approval.decisionJson) {
      db.update(approvalRequests)
        .set({ traceJson, decisionJson })
        .where(eq(approvalRequests.id, approval.id))
        .run();
    }
  }

  const rows = db.select().from(auditLog).orderBy(asc(auditLog.seq)).all();
  const updatedRows = rows.map((row) => ({
    ...row,
    actorId: ACTOR_REMAP[row.actorId] ?? row.actorId,
    actorRole: ROLE_REMAP[row.actorRole] ?? row.actorRole,
    decisionJson: remapJsonText(row.decisionJson),
  }));
  const changed = updatedRows.some(
    (row, index) =>
      row.actorId !== rows[index].actorId ||
      row.actorRole !== rows[index].actorRole ||
      row.decisionJson !== rows[index].decisionJson,
  );
  if (!changed) return;

  const chain = verifyChain();
  if (!chain.ok) {
    throw new Error(`Cannot migrate roles in a broken audit chain at sequence ${chain.firstBreak?.seq}`);
  }

  const updateRow = sqlite.prepare(
    "UPDATE audit_log SET actor_id = ?, actor_role = ?, decision_json = ?, prev_hash = ?, row_hash = ? WHERE seq = ?",
  );
  const updateHead = sqlite.prepare(
    "UPDATE audit_head SET seq = ?, row_hash = ?, updated_at = ? WHERE id = 1",
  );
  const now = Date.now();
  let previousHash = GENESIS_HASH;
  const transaction = sqlite.transaction(() => {
    for (const row of updatedRows) {
      const rowHash = computeRowHash(row, previousHash);
      if (
        row.actorId !== rows[row.seq - 1]?.actorId ||
        row.actorRole !== rows[row.seq - 1]?.actorRole ||
        row.decisionJson !== rows[row.seq - 1]?.decisionJson ||
        row.prevHash !== previousHash ||
        row.rowHash !== rowHash
      ) {
        updateRow.run(
          row.actorId,
          row.actorRole,
          row.decisionJson,
          previousHash,
          rowHash,
          row.seq,
        );
      }
      previousHash = rowHash;
    }
    if (updatedRows.length > 0) updateHead.run(updatedRows.length, previousHash, now);
  });
  transaction();
}
