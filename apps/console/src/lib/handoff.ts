import type { Actor } from "@console/engine/types";
import {
  buildContext,
  ContextFile,
  type EvidenceRow,
  type Operation,
  operationLabel,
  type RunnableSpec,
} from "@console/tool-automation";
import { readContextJson, type BridgeDeps } from "@console/tool-automation/bridge";
import { kycTool } from "@console/tool-kyc";
import { refundTool } from "@console/tool-refunds";
import { devinMode } from "@/lib/devin-status";
import type { FactLabels } from "@/lib/fact-format";

/**
 * Everything the handoff panel shows and the dispatch needs, built on the
 * server with a placeholder run id. The requester sees exactly what Devin
 * will see: evidence with no personal data, the settings snapshot and the base.
 */
export interface HandoffOffer {
  spec: string;
  operation: Operation;
  /** The operation as the operator reads it, e.g. "Change". */
  operationLabel: string;
  /** The panel's heading and the one line under it, from the spec. */
  title: string;
  description: string;
  /** The spec's suggestion for the request: for a change the box starts empty and Tab fills it; for an undo it is shown read-only. */
  intent: string;
  evidenceKey: string;
  evidenceIds: string[];
  evidence: EvidenceRow[];
  constants: Record<string, number>;
  base: { branch: string; commit: string };
  allowedPaths: string[];
  /** Display labels for coded evidence values; not part of the brief. */
  evidenceLabels: FactLabels;
  /** False without `DEVIN_API_KEY`: the panel shows the brief but can't send it. */
  live: boolean;
  reverses?: { runId: string; mergeCommit: string; prUrl: string | null } | null;
}

export type AgentFocus =
  | { kind: "handoff"; offer: HandoffOffer }
  | { kind: "run"; runId: string }
  | null;

/** The labels the evidence tool declares for its coded fields: statuses for the status field, options for enum filters. Display only. */
export function evidenceLabels(tool: string): FactLabels {
  const decl = [kycTool, refundTool].find((t) => t.name === tool);
  if (!decl) return {};
  const labels: FactLabels = {
    [decl.statusField]: Object.fromEntries(decl.statuses.map((s) => [s.value, s.label])),
  };
  for (const f of decl.filters)
    if (f.type === "enum" && f.options)
      labels[f.field] ??= Object.fromEntries(f.options.map((o) => [o.value, o.label]));
  return labels;
}

/** Evidence an undo reuses from the undone run's context.json. */
export function reversalEvidence(
  repoRoot: string,
  reverses: string,
): { evidenceKey: string; evidenceIds: string[] } {
  const json = readContextJson(repoRoot, reverses);
  if (!json) throw new Error(`No context.json on disk for run ${reverses}`);
  const context = ContextFile.parse(JSON.parse(json));
  const sep = context.evidence.source.indexOf(":");
  return {
    evidenceKey: sep < 0 ? context.evidence.source : context.evidence.source.slice(sep + 1),
    evidenceIds: context.evidence.rows.map((row) => row.id),
  };
}

/**
 * Build the offer the Devin window's handoff panel renders. Returns null
 * when the context can't be built (for example a record that no longer
 * qualifies), so a caller can simply omit the button.
 */
export function buildHandoffOffer(
  spec: RunnableSpec,
  operation: Operation,
  actor: Actor,
  input: { evidenceKey: string; evidenceIds: readonly string[]; reverses?: HandoffOffer["reverses"] },
  deps: Pick<BridgeDeps, "repoRoot">,
): HandoffOffer | null {
  let built: ReturnType<typeof buildContext>;
  try {
    built = buildContext({
      runId: "preview",
      operation,
      spec,
      intent: spec.intents[operation],
      requestedBy: actor.role,
      evidenceKey: input.evidenceKey,
      evidenceIds: input.evidenceIds,
      reverses: input.reverses
        ? { runId: input.reverses.runId, mergeCommit: input.reverses.mergeCommit }
        : null,
      repoRoot: deps.repoRoot,
    });
  } catch {
    return null;
  }
  return {
    spec: spec.file,
    operation,
    operationLabel: operationLabel(operation),
    title: operation === "undo" ? "Undo this change" : spec.title,
    description:
      operation === "undo"
        ? "Devin takes the change back out of the code and keeps everything built since. An engineer reviews it before it goes live."
        : spec.description,
    intent: built.context.intent,
    evidenceKey: input.evidenceKey,
    evidenceIds: [...input.evidenceIds],
    evidence: built.context.evidence.rows,
    constants: built.context.constants,
    base: built.context.base,
    allowedPaths: built.context.allowed_paths,
    evidenceLabels: evidenceLabels(spec.evidence.tool),
    live: devinMode() === "live",
    reverses: input.reverses ?? null,
  };
}
