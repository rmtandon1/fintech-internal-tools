import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@console/db";
import { auditHead } from "@console/db-core/engine-schema";
import { canonicalJson, sha256 } from "@console/engine/audit/canonical";
import { loadConstants } from "@console/engine/policy/constants";
import type { Role } from "@console/permissions";
import { refunds } from "@console/tool-refunds/schema";
import { ContextFile, type EvidenceRow, type Reverses } from "./run-files";
import { scopePaths, type RunKind, type RunScope, type RunnableSpec } from "./specs";

export interface ContextRequest {
  runId: string;
  kind: RunKind;
  spec: RunnableSpec;
  scope: RunScope;
  intent: string;
  requestedBy: Role;
  /** Cluster group key on the spec's evidence source, e.g. the merchant. */
  clusterKey: string;
  /** Record ids the cluster drawer showed; only allowlisted columns are read. */
  evidenceIds: readonly string[];
  reverses?: { runId: string; mergeCommit: string } | null;
  /** Repository root, for `git rev-parse` and `runs/<id>/context.json`. */
  repoRoot?: string;
}

export interface BuiltContext {
  context: ContextFile;
  /** Canonical serialisation: sorted keys, no whitespace. This is what is hashed. */
  json: string;
  sha256: string;
}

/**
 * Captures what Devin must know about the live database, and nothing it
 * mustn't. Evidence rows are selected column by column from an allowlist, so
 * emails and card numbers are never read, let alone masked.
 */
export function buildContext(req: ContextRequest): BuiltContext {
  const root = req.repoRoot ?? process.cwd();
  const constants = readConstants(req.spec.constantKeys);
  const context = ContextFile.parse({
    run_id: req.runId,
    kind: req.kind,
    spec: req.spec.file,
    intent: req.intent,
    requested_by: req.requestedBy,
    base: { branch: git(root, "rev-parse", "--abbrev-ref", "HEAD"), commit: git(root, "rev-parse", "HEAD") },
    scope: scopePaths(req.spec, req.scope, req.runId),
    constants,
    evidence: {
      cluster: `${req.spec.evidence.cluster}:${req.clusterKey}`,
      rows: evidenceRows(req.spec, req.evidenceIds),
    },
    reverses: req.reverses ? reversesBlock(root, req.reverses) : null,
    audit_head: readAuditHead(),
  });
  const json = canonicalJson(context);
  return { context, json, sha256: sha256(json) };
}

function readConstants(keys: readonly string[]): Record<string, number> {
  const reader = loadConstants();
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = reader.number(key, Number.NaN);
  return out;
}

/** Column allowlist per evidence tool. Anything not named here does not exist to Devin. */
function evidenceRows(spec: RunnableSpec, ids: readonly string[]): EvidenceRow[] {
  if (ids.length === 0) return [];
  if (spec.evidence.tool !== "refunds") {
    throw new Error(`no evidence reader for tool ${spec.evidence.tool}`);
  }
  return db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      reasonCode: refunds.reasonCode,
      usdMinor: refunds.usdMinor,
      requestedAt: refunds.requestedAt,
    })
    .from(refunds)
    .where(and(inArray(refunds.id, [...ids]), eq(refunds.reasonCode, "not_received")))
    .orderBy(refunds.requestedAt)
    .all()
    .map((r) => ({ ...r, requestedAt: new Date(r.requestedAt).toISOString() }));
}

function reversesBlock(root: string, target: { runId: string; mergeCommit: string }): Reverses {
  const path = join(root, "runs", target.runId, "context.json");
  let atDispatch: Record<string, number> | null = null;
  if (existsSync(path)) {
    const parsed = ContextFile.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (parsed.success) atDispatch = parsed.data.constants;
  }
  return { run_id: target.runId, merge_commit: target.mergeCommit, constants_at_dispatch: atDispatch };
}

function readAuditHead(): { seq: number; rowHash: string } {
  const head = db.select({ seq: auditHead.seq, rowHash: auditHead.rowHash }).from(auditHead).get();
  return head ?? { seq: 0, rowHash: "" };
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
