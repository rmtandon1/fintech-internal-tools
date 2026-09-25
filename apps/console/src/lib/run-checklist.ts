import { PHASES, type StructuredOutput } from "@console/tool-automation/run-files";
import type { z } from "zod";
import type { ChecklistState } from "@/lib/checklist-glyph";
import { PHASE_LABELS, PHASE_STATUS_LABELS } from "@/lib/run-phases";

export { CHECKLIST_GLYPH, type ChecklistState } from "@/lib/checklist-glyph";

type Output = z.infer<typeof StructuredOutput>;
type Phase = (typeof PHASES)[number];

export interface ChecklistLine {
  /** The `structured_output` field this line is read from. */
  field: keyof Output;
  state: ChecklistState;
  label: string;
  detail?: string;
}

/**
 * The operator's checklist is a projection of `structured_output`: each line
 * is read from one field and appears only once that field carries a value.
 * Nothing is inferred from the phase alone, so a session that never reports
 * a field never shows a line for it.
 */
export function runChecklist(out: Output | null): ChecklistLine[] {
  if (!out) return [];
  const lines: ChecklistLine[] = [];
  const phaseState = (phase: Phase): ChecklistState => {
    const at = PHASES.indexOf(out.phase);
    const of = PHASES.indexOf(phase);
    if (of < at) return "done";
    if (of > at) return "waiting";
    return out.phase_status === "done" ? "done" : "running";
  };

  if (out.base_commit) {
    lines.push({
      field: "base_commit",
      state: phaseState("intake"),
      label: "Read the codebase",
      detail: `base ${out.base_commit.slice(0, 7)}`,
    });
  }

  const tests = out.verify_steps.find((s) => s.name === "tests");
  if (tests && tests.before !== undefined) {
    const baselineFailed = tests.pass === false && tests.after === undefined;
    lines.push({
      field: "verify_steps",
      state: baselineFailed ? "failed" : phaseState("baseline"),
      label: baselineFailed ? "Existing tests fail" : "Existing tests pass",
      detail: `${tests.before} tests`,
    });
  }

  for (const reuse of out.reuses) {
    lines.push({
      field: "reuses",
      state: phaseState("plan"),
      label: `Reused ${reuse.module}`,
      detail: reuse.reason,
    });
  }

  for (const conflict of out.conflicts) {
    lines.push({
      field: "conflicts",
      state: phaseState("edit"),
      label: `Resolved a clash in ${conflict.file}`,
      detail: `kept ${conflict.kept}`,
    });
  }

  out.files.forEach((file, i) => {
    const verb = file.op === "delete" ? "Removing" : file.op === "create" ? "Adding" : "Editing";
    const current = i === out.files.length - 1;
    lines.push({
      field: "files",
      state: current ? phaseState("edit") : "done",
      label: `${verb} ${file.path}`,
      detail: `+${file.additions} −${file.deletions}`,
    });
  });

  if (out.guards.length > 0) {
    const failed = out.guards.filter((g) => g.pass === false);
    const pending = out.guards.some((g) => g.pass === null);
    lines.push({
      field: "guards",
      state: failed.length > 0 ? "failed" : pending ? "running" : "done",
      label: failed.length > 0 ? `Safety check failed: ${failed.map((g) => g.name).join(", ")}` : "Safety checks",
      detail: out.guards.map((g) => g.name).join(" · "),
    });
  }

  if (tests && tests.after !== undefined) {
    lines.push({
      field: "verify_steps",
      state:
        tests.pass === false ? "failed" : tests.after === null || tests.pass === null ? "running" : "done",
      label: tests.pass === false ? "Tests failed" : "Tests",
      detail: tests.after === null ? `${tests.before ?? "?"} → …` : `${tests.before ?? "?"} → ${tests.after}`,
    });
  }

  if (out.pr_url) {
    lines.push({
      field: "pr_url",
      state: out.phase === "pull_request" && out.phase_status === "waiting_for_user" ? "running" : "done",
      label: "Sent for review",
      detail: out.pr_url.replace(/^https:\/\/github\.com\//, ""),
    });
  }

  if (out.merge_commit) {
    lines.push({
      field: "merge_commit",
      state: "done",
      label: "Live",
      detail: out.merge_commit.slice(0, 7),
    });
  }

  if (out.stopped_by) {
    lines.push({ field: "stopped_by", state: "done", label: `Stopped by ${out.stopped_by}` });
  }

  return lines;
}

/** Where the session says it is, in words: `Testing the change · in progress`. */
export function phaseLine(out: Output | null): string | null {
  return out ? `${PHASE_LABELS[out.phase]} · ${PHASE_STATUS_LABELS[out.phase_status]}` : null;
}
