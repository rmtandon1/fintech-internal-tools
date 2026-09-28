import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@console/db";
import { auditHead } from "@console/db-core/engine-schema";
import { canonicalJson, sha256 } from "@console/engine/audit/canonical";
import { loadConstants } from "@console/engine/policy/constants";
import type { Role } from "@console/permissions";
import { kycCases, kycChecks } from "@console/tool-kyc/schema";
import { refundTool } from "@console/tool-refunds";
import { refunds } from "@console/tool-refunds/schema";
import { ContextFile, type Evidence, type EvidenceRow, type Reverses } from "./run-files";
import { allowedPaths, type Operation, type RunnableSpec } from "./specs";

export interface ContextRequest {
  runId: string;
  operation: Operation;
  spec: RunnableSpec;
  intent: string;
  requestedBy: Role;
  /** The record the request starts from: a case id, a refund id or an app's id. */
  evidenceKey: string;
  /** Row ids to include; only allowlisted columns are read. */
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
  const reversed = req.reverses ? readContext(root, req.reverses.runId) : null;
  const context = ContextFile.parse({
    run_id: req.runId,
    operation: req.operation,
    spec: req.spec.file,
    intent: req.intent,
    requested_by: req.requestedBy,
    base: { branch: git(root, "rev-parse", "--abbrev-ref", "HEAD"), commit: git(root, "rev-parse", "HEAD") },
    allowed_paths: allowedPaths(req.spec, req.runId),
    constants,
    // An undo reproduces the run it undoes: its evidence rows are the
    // ones the original run carried, verbatim, since the records may have
    // changed since. Constants and the audit head are still live reads.
    evidence: reversed?.evidence ?? readEvidence(req.spec, req.evidenceKey, req.evidenceIds, root),
    reverses: req.reverses ? reversesBlock(req.reverses, reversed) : null,
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

/**
 * Evidence is read now, from the record the request starts on, so a stale or
 * mixed selection can't smuggle in rows the screen wouldn't show. Columns are
 * an allowlist per source: anything not named here doesn't exist to Devin.
 */
function readEvidence(
  spec: RunnableSpec,
  key: string,
  ids: readonly string[],
  root: string,
): Evidence {
  const source = `${spec.evidence.tool}:${key}`;
  if (ids.length === 0) return { source, rows: [] };
  switch (spec.evidence.tool) {
    case "kyc":
      return { source, rows: [businessCase(key, ids)] };
    case "refunds":
      return { source, rows: clusterRows(spec, key, ids) };
    case "roadmap":
      return { source, rows: exportFiles(root, key, ids) };
    default:
      throw new Error(`no evidence reader for ${spec.evidence.tool}`);
  }
}

function onlyKey(key: string, ids: readonly string[]): void {
  if (ids.length !== 1 || ids[0] !== key) {
    throw new Error(`evidence for ${key} is that record alone, not ${ids.join(", ")}`);
  }
}

/**
 * A UK business case. A company's name and registration number are public
 * record; the contact email and any person's details are not read.
 */
function businessCase(key: string, ids: readonly string[]): EvidenceRow {
  onlyKey(key, ids);
  const row = db
    .select({
      id: kycCases.id,
      company: kycCases.customerName,
      segment: kycCases.segment,
      country: kycCases.country,
      documentType: kycCases.documentType,
      registrationNumber: kycCases.documentNumber,
      status: kycCases.status,
    })
    .from(kycCases)
    .where(eq(kycCases.id, key))
    .get();
  if (!row) throw new Error(`no KYC case ${key}`);
  if (row.segment !== "business" || row.country !== "GB" || row.documentType !== "company_registry") {
    throw new Error(`${key} is not a UK business case`);
  }
  const registry = db
    .select({ result: kycChecks.result, detail: kycChecks.detail, source: kycChecks.source })
    .from(kycChecks)
    .where(and(eq(kycChecks.caseId, key), eq(kycChecks.kind, "company_registry")))
    .get();
  return {
    id: row.id,
    facts: {
      company: row.company,
      registrationNumber: row.registrationNumber.replace(/^GB/, ""),
      country: row.country,
      status: row.status,
      registryCheck: registry ? `${registry.result}: ${registry.detail} (${registry.source})` : null,
    },
  };
}

/**
 * Refunds from one group of the spec's cluster, computed now by the refunds
 * tool, so a stale or mixed selection can't carry rows the drawer wouldn't
 * show. Amount, merchant, reason and timing only: never who they're for.
 */
function clusterRows(spec: RunnableSpec, key: string, ids: readonly string[]): EvidenceRow[] {
  const clusterId = spec.evidence.cluster;
  const cluster = refundTool.clusters?.find((c) => c.id === clusterId);
  if (!clusterId || !cluster) throw new Error(`refunds has no cluster ${clusterId ?? "(none)"}`);
  const group = cluster.groups().find((g) => g.key === key);
  if (!group) throw new Error(`cluster ${clusterId} has no group ${key}`);
  const members = new Set(group.recordIds);
  const strays = ids.filter((id) => !members.has(id));
  if (strays.length > 0) throw new Error(`evidence rows are not in cluster ${key}: ${strays.join(", ")}`);
  return db
    .select({
      id: refunds.id,
      merchant: refunds.merchant,
      reasonCode: refunds.reasonCode,
      usdMinor: refunds.usdMinor,
      requestedAt: refunds.requestedAt,
    })
    .from(refunds)
    .where(inArray(refunds.id, [...ids]))
    .orderBy(refunds.requestedAt)
    .all()
    .map((r) => ({
      id: r.id,
      facts: {
        merchant: r.merchant,
        reasonCode: r.reasonCode,
        usdMinor: r.usdMinor,
        requestedAt: new Date(r.requestedAt).toISOString(),
      },
    }));
}

/** The folder a Power Apps export for app `key` is committed in. */
export function exportDir(root: string, key: string): string {
  return join(root, "fixtures", "power-apps", key);
}

/** Every file in an app's export, relative to its folder, sorted. */
export function listExport(root: string, key: string): string[] {
  const dir = exportDir(root, key);
  if (!/^[a-z_]+$/.test(key) || !existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path));
    }
  };
  walk(dir);
  return out;
}

/** An app's Power Apps export, as a file list with sizes: Devin reads the files themselves. */
function exportFiles(root: string, key: string, ids: readonly string[]): EvidenceRow[] {
  const files = new Set(listExport(root, key));
  const strays = ids.filter((id) => !files.has(id));
  if (strays.length > 0) throw new Error(`not in the ${key} export: ${strays.join(", ")}`);
  return [...ids].sort().map((id) => {
    const text = readFileSync(join(exportDir(root, key), id), "utf8");
    return {
      id,
      facts: {
        path: `fixtures/power-apps/${key}/${id}`,
        lines: text.split("\n").length,
      },
    };
  });
}

/**
 * `runs/<id>/context.json`, falling back to the data-dir copy a successful
 * dispatch leaves for later undos to read.
 */
export function readContextJson(repoRoot: string, runId: string): string | null {
  const candidates = [
    join(repoRoot, "runs", runId, "context.json"),
    join(repoRoot, "apps", "console", "data", "runs", runId, "context.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return null;
}

/** The reversed run's context file, or null when it is missing or malformed. */
function readContext(root: string, runId: string): ContextFile | null {
  const json = readContextJson(root, runId);
  if (!json) return null;
  const parsed = ContextFile.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data : null;
}

function reversesBlock(target: { runId: string; mergeCommit: string }, context: ContextFile | null): Reverses {
  return {
    run_id: target.runId,
    merge_commit: target.mergeCommit,
    constants_at_dispatch: context?.constants ?? null,
  };
}

function readAuditHead(): { seq: number; rowHash: string } {
  const head = db.select({ seq: auditHead.seq, rowHash: auditHead.rowHash }).from(auditHead).get();
  return head ?? { seq: 0, rowHash: "" };
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
