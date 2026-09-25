import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@console/db";
import { auditLog } from "@console/db-core/engine-schema";

export type AuditRow = typeof auditLog.$inferSelect;

export interface AuditFilters {
  tool?: string;
  actorId?: string;
  action?: string;
  event?: string;
  recordId?: string;
  limit?: number;
  offset?: number;
}

export function listAuditEvents(filters: AuditFilters = {}): {
  rows: AuditRow[];
  total: number;
} {
  const clauses: SQL[] = [];
  if (filters.tool) clauses.push(eq(auditLog.tool, filters.tool));
  if (filters.actorId) clauses.push(eq(auditLog.actorId, filters.actorId));
  if (filters.action) clauses.push(eq(auditLog.action, filters.action));
  if (filters.event) clauses.push(eq(auditLog.event, filters.event));
  if (filters.recordId) clauses.push(eq(auditLog.recordId, filters.recordId));
  const where = clauses.length ? and(...clauses) : undefined;

  const rows = db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.seq))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0)
    .all();

  const [{ value } = { value: 0 }] = db
    .select({ value: count() })
    .from(auditLog)
    .where(where)
    .all();

  return { rows, total: value };
}

export function auditTrailFor(recordType: string, recordId: string): AuditRow[] {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.recordType, recordType), eq(auditLog.recordId, recordId)))
    .orderBy(desc(auditLog.seq))
    .all();
}

export function auditStats(): { total: number; lastTs: number | null } {
  const [{ value } = { value: 0 }] = db.select({ value: count() }).from(auditLog).all();
  const last = db
    .select({ ts: auditLog.ts })
    .from(auditLog)
    .orderBy(desc(auditLog.seq))
    .limit(1)
    .get();
  return { total: value, lastTs: last?.ts ?? null };
}
