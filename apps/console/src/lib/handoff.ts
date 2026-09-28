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

/**
 * Everything the handoff panel shows and the dispatch needs, built on the
 * server with a placeholder run id. The requester sees exactly what Devin
 * will see: evidence with no personal data, the settings snapshot and the base.
 */
export interface HandoffOffer {
  spec: string;
  kind: RunKind;
  /** The kind as the operator reads it, e.g. "Addition". */
  kindLabel: string;
  /** The panel's heading and the one line under it, from the spec. */
  title: string;
  description: string;
  intent: string;
  scope: string;
  evidenceKey: string;
  evidenceIds: string[];
  evidence: EvidenceRow[];
  constants: Record<string, number>;
  base: { branch: string; commit: string };
  scopePaths: string[];
  /** False without `DEVIN_API_KEY`: the panel shows the brief but can't send it. */
  live: boolean;
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
  kind: RunKind,
  actor: Actor,
  input: { evidenceKey: string; evidenceIds: readonly string[]; reverses?: HandoffOffer["reverses"] },
  deps: Pick<BridgeDeps, "repoRoot">,
): HandoffOffer | null {
  let built: ReturnType<typeof buildContext>;
  try {
    built = buildContext({
      runId: "preview",
      kind,
      spec,
      scope: spec.scope,
      intent: spec.intents[kind] ?? "",
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
    kind,
    kindLabel: runKindLabel(kind),
    title: kind === "REVERSAL" ? "Undo this change" : spec.title,
    description:
      kind === "REVERSAL"
        ? "Devin takes the change back out of the code and keeps everything built since. An engineer reviews it before it goes live."
        : spec.description,
    intent: built.context.intent,
    scope: spec.scope,
    evidenceKey: input.evidenceKey,
    evidenceIds: [...input.evidenceIds],
    evidence: built.context.evidence.rows,
    constants: built.context.constants,
    base: built.context.base,
    scopePaths: built.context.scope,
    live: devinMode() === "live",
    reverses: input.reverses ?? null,
  };
}
