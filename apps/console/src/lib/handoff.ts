import type { Actor } from "@console/engine/types";
import {
  buildContext,
  ContextFile,
  type EvidenceRow,
  type RunKind,
  runKindLabel,
  type RunnableSpec,
} from "@console/tool-automation";
import { readContextJson, type BridgeDeps } from "@console/tool-automation/bridge";
import { devinMode } from "@/lib/devin-status";
import { simulationsFor, type SimulatedRun } from "@/lib/simulation";

/**
 * Everything the handoff panel shows and the dispatch needs, built on the
 * server with a placeholder run id. The requester sees exactly what Devin
 * will see: evidence with no PII, the constants snapshot and the base.
 */
export interface HandoffOffer {
  spec: string;
  kind: RunKind;
  /** The kind as the operator reads it, e.g. "New rule". */
  kindLabel: string;
  intent: string;
  scope: string;
  clusterKey: string;
  evidenceIds: string[];
  evidence: EvidenceRow[];
  constants: Record<string, number>;
  base: { branch: string; commit: string };
  scopePaths: string[];
  /** Pre-written runs for simulation mode; null when live (`DEVIN_API_KEY` set). */
  simulations: Partial<Record<string, SimulatedRun>> | null;
  reverses?: { runId: string; mergeCommit: string; prUrl: string | null } | null;
}

export type AgentFocus =
  | { kind: "handoff"; offer: HandoffOffer }
  | { kind: "run"; runId: string }
  | null;

/** Evidence a REVERSAL reuses from the reversed run's context.json. */
export function reversalEvidence(
  repoRoot: string,
  reverses: string,
): { clusterKey: string; evidenceIds: string[] } {
  const json = readContextJson(repoRoot, reverses);
  if (!json) throw new Error(`No context.json on disk for run ${reverses}`);
  const context = ContextFile.parse(JSON.parse(json));
  const sep = context.evidence.cluster.indexOf(":");
  return {
    clusterKey: sep < 0 ? context.evidence.cluster : context.evidence.cluster.slice(sep + 1),
    evidenceIds: context.evidence.rows.map((row) => row.id),
  };
}

/**
 * Build the offer the agent column's handoff panel renders. Returns null
 * when the context cannot be built (for example a stale evidence id), so a
 * caller can simply omit the button.
 */
export function buildHandoffOffer(
  spec: RunnableSpec,
  kind: RunKind,
  actor: Actor,
  input: { clusterKey: string; evidenceIds: readonly string[]; reverses?: HandoffOffer["reverses"] },
  deps: Pick<BridgeDeps, "repoRoot">,
): HandoffOffer | null {
  const built = buildContext({
    runId: "preview",
    kind,
    spec,
    scope: "rule",
    intent: spec.intents[kind] ?? "",
    requestedBy: actor.role,
    clusterKey: input.clusterKey,
    evidenceIds: input.evidenceIds,
    reverses: input.reverses
      ? { runId: input.reverses.runId, mergeCommit: input.reverses.mergeCommit }
      : null,
    repoRoot: deps.repoRoot,
  });
  return {
    spec: spec.file,
    kind,
    kindLabel: runKindLabel(kind),
    intent: built.context.intent,
    scope: spec.scope,
    clusterKey: input.clusterKey,
    evidenceIds: [...input.evidenceIds],
    evidence: built.context.evidence.rows,
    constants: built.context.constants,
    base: built.context.base,
    scopePaths: built.context.scope,
    simulations: devinMode() === "simulation" ? simulationsFor(spec.file, [kind]) : null,
    reverses: input.reverses ?? null,
  };
}
