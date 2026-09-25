import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Append-only, hash-chained audit log. `seq` is dense and monotonic; each row
 * hashes its own canonical JSON together with the previous row's hash.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull().unique(),
    ts: integer("ts").notNull(),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    tool: text("tool").notNull(),
    action: text("action").notNull(),
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    event: text("event").notNull(),
    summary: text("summary").notNull(),
    payloadJson: text("payload_json").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    decisionJson: text("decision_json").notNull(),
    prevHash: text("prev_hash").notNull(),
    rowHash: text("row_hash").notNull(),
  },
  (t) => [
    index("audit_log_record_idx").on(t.recordType, t.recordId),
    index("audit_log_tool_idx").on(t.tool),
    index("audit_log_ts_idx").on(t.ts),
  ],
);

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  actorId: text("actor_id").notNull(),
  tool: text("tool").notNull(),
  action: text("action").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull().$type<"in_progress" | "completed" | "failed">(),
  resultJson: text("result_json"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const approvalRequests = sqliteTable(
  "approval_requests",
  {
    id: text("id").primaryKey(),
    tool: text("tool").notNull(),
    action: text("action").notNull(),
    recordType: text("record_type").notNull(),
    recordId: text("record_id"),
    /** Record version frozen at request time; a mismatch fails the execution. */
    recordVersion: integer("record_version"),
    payloadJson: text("payload_json").notNull(),
    traceJson: text("trace_json").notNull(),
    /** The tool's decision frozen at request time; replayed verbatim on approval. */
    decisionJson: text("decision_json").notNull(),
    summary: text("summary").notNull(),
    reason: text("reason").notNull(),
    tier: text("tier").notNull(),
    allowedRolesJson: text("allowed_roles_json").notNull(),
    requesterId: text("requester_id").notNull(),
    requesterRole: text("requester_role").notNull(),
    status: text("status")
      .notNull()
      .$type<"pending" | "approved" | "rejected" | "failed">(),
    decidedBy: text("decided_by"),
    decidedAt: integer("decided_at"),
    decisionNote: text("decision_note"),
    failureCode: text("failure_code"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("approval_requests_status_idx").on(t.status)],
);

/**
 * Single-row checkpoint of the audit chain head. Written in the same
 * transaction as every append, so deleting the tail of `audit_log` leaves a
 * head the remaining rows cannot account for.
 */
export const auditHead = sqliteTable("audit_head", {
  id: integer("id").primaryKey(),
  seq: integer("seq").notNull(),
  rowHash: text("row_hash").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Numeric/list policy thresholds, read fresh on every policy evaluation. */
export const runtimeConstants = sqliteTable("runtime_constants", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  type: text("type").notNull().$type<"number" | "string_list" | "boolean">(),
  description: text("description").notNull(),
  tool: text("tool").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
