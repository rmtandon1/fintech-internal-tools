import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Devin runs the console has asked for. A row moves only through audited
 * intents (dispatch, record_session, approve_pr, record_merge, stop); polled
 * session progress is held in memory and never written here.
 */
export const devinRuns = sqliteTable(
  "devin_runs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    spec: text("spec").notNull(),
    /** The tool whose rules the run changes; one run in flight per tool. */
    tool: text("tool").notNull(),
    scope: text("scope").notNull(),
    intent: text("intent").notNull(),
    contextSha256: text("context_sha256").notNull(),
    sessionId: text("session_id"),
    status: text("status").notNull(),
    prUrl: text("pr_url"),
    mergeCommit: text("merge_commit"),
    /** For a REVERSAL, the id of the merged IMPLEMENTATION it undoes. */
    reverses: text("reverses"),
    requestedBy: text("requested_by").notNull(),
    requestedByRole: text("requested_by_role").notNull(),
    approvedBy: text("approved_by"),
    lastNote: text("last_note"),
    requestedAt: integer("requested_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (t) => [
    index("devin_runs_status_idx").on(t.status),
    index("devin_runs_tool_idx").on(t.tool),
    index("devin_runs_reverses_idx").on(t.reverses),
  ],
);
