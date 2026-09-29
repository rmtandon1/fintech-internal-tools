import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { REFUND_CLUSTERING_HOLD } from "@console/tool-automation";
import { scriptedFrames } from "../helpers/scripted-clients";

vi.mock("@/app/automation-actions", () => ({
  approveAutomationRun: vi.fn(),
  stopAutomationRun: vi.fn(),
  syncAutomationRun: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { RunView } from "@/components/run-view";
import type { RunViewPayload } from "@/lib/devin-route";
import { phaseLine } from "@/lib/run-checklist";
import { runTitle, thinkingLine } from "@/lib/run-heading";

const RUN_ID = "01KRUNVIEWTEST000000000000";
const PROMPT = `${REFUND_CLUSTERING_HOLD.intents.change}\nOperation: change. Run: ${RUN_ID}.`;
const frames = scriptedFrames("change", RUN_ID, "a".repeat(64), "b".repeat(40));
const editing = frames.slice(0, 4);
const phaseLines = (html: string) =>
  [...html.matchAll(/<ul[^>]*data-testid="phase-lines"[^>]*>(.*?)<\/ul>/g)].map((match) => match[1] ?? "");

function payload(overrides: Partial<RunViewPayload> = {}): RunViewPayload {
  return {
    mode: "live",
    run: {
      id: RUN_ID,
      operation: "change",
      spec: REFUND_CLUSTERING_HOLD.file,
      tool: "refunds",
      intent: REFUND_CLUSTERING_HOLD.intents.change,
      status: "running",
      sessionUrl: null,
      prUrl: null,
      mergeCommit: null,
      reverses: null,
      requestedBy: "usr_refunds_manager",
      requestedByRole: "refunds_manager",
      approvedBy: null,
      lastNote: null,
      requestedAt: 0,
      updatedAt: 0,
    },
    frames: editing,
    latest: editing.at(-1) ?? null,
    sessionUrl: null,
    devinMessage: null,
    sessionStatusDetail: null,
    summary: REFUND_CLUSTERING_HOLD.summaries.change,
    outcome: REFUND_CLUSTERING_HOLD.outcomes.change,
    operationLabel: "Change",
    prompt: PROMPT,
    lastAuditId: null,
    reviewerChecklist: [],
    offers: {
      approve: { offered: false },
      stop: { offered: false },
      reply: false,
      reverse: { offered: false },
      sync: false,
    },
    ...overrides,
  };
}

function render(p: RunViewPayload): string {
  return renderToStaticMarkup(createElement(RunView, { runId: RUN_ID, initial: p }));
}

describe("runTitle", () => {
  it("names what Devin is doing from the spec's summary for the operation", () => {
    expect(runTitle(payload())).toBe(
      "Devin is holding split refunds that add up past the manager limit.",
    );
  });
});

describe("thinkingLine", () => {
  it("is the session's status detail", () => {
    expect(thinkingLine(editing.at(-1) ?? null)).toBe(editing.at(-1)?.status_detail);
  });

  it("falls back to the reported phase when the session gives no detail", () => {
    const latest = { ...frames[1], status_detail: null };
    expect(thinkingLine(latest)).toBe(phaseLine(latest.structured_output));
  });

  it("prefers Devin's latest message in the session", () => {
    expect(thinkingLine(editing.at(-1) ?? null, "Running the baseline tests")).toBe("Running the baseline tests");
  });

  it("is empty before the first frame", () => {
    expect(thinkingLine(null)).toBeNull();
  });
});

describe("RunView", () => {
  it("shows Devin's current thinking from the latest frame", () => {
    const html = render(payload());
    expect(html).toContain("data-testid=\"devin-thinking\"");
    expect(html).toContain("Devin’s current thinking");
    expect(html).toContain(editing.at(-1)?.status_detail ?? "missing");
  });

  it("shows the message sent to Devin as it was sent", () => {
    const html = render(payload());
    expect(html).toContain("Message sent to Devin");
    expect(html).toContain(`Operation: change. Run: ${RUN_ID}.`);
    expect(render(payload({ prompt: null }))).not.toContain("Message sent to Devin");
  });

  it("spins on the reported phase, ticks the ones before and leaves the rest waiting", () => {
    const html = render(payload());
    expect(html.match(/data-state="active"/g)).toHaveLength(1);
    expect(html).toMatch(/data-state="active"><span role="status" aria-label="In progress" class="[^"]*animate-spin/);
    expect(html).toMatch(/data-state="done"><span class="[^"]*bg-success[^"]*"><svg[^>]*aria-label="Done"/);
    expect(html).toMatch(/data-state="waiting"><span class="[^"]*"><span class="[^"]*border-muted-foreground/);
    expect(html).not.toContain('aria-label="Paused"');
  });

  it("leaves reported files waiting until the edit phase finishes", () => {
    const fileLines = (html: string) => phaseLines(html).find((list) => list.includes("Adding "));
    const editingFiles = fileLines(render(payload()));
    expect(editingFiles).toBeDefined();
    expect(editingFiles?.match(/data-state="waiting"/g)).toHaveLength(editing[3]?.structured_output.files.length);
    expect(editingFiles).not.toContain('data-state="done"');

    const verifying = frames.find((frame) => frame.structured_output.phase === "verify");
    if (!verifying) throw new Error("no verification frame");
    const verifiedFiles = fileLines(render(payload({ frames: [verifying], latest: verifying })));
    expect(verifiedFiles?.match(/data-state="done"/g)).toHaveLength(verifying.structured_output.files.length);
  });

  it("activates only the next pending check and marks failures red", () => {
    const verifying = frames.find((frame) => frame.structured_output.phase === "verify");
    if (!verifying) throw new Error("no verification frame");
    const html = render(payload({ frames: [verifying], latest: verifying }));
    const verifyLines = phaseLines(html).find((list) => list.includes("Lint"));
    expect(verifyLines?.match(/data-state="active"/g)).toHaveLength(1);
    expect(verifyLines?.match(/data-state="waiting"/g)).toHaveLength(3);

    const failed = {
      ...verifying,
      structured_output: {
        ...verifying.structured_output,
        verify_steps: verifying.structured_output.verify_steps.map((step, i) =>
          i === 0 ? { ...step, pass: false } : step),
      },
    };
    const failedHtml = render(payload({ frames: [failed], latest: failed }));
    const failedVerifyLines = phaseLines(failedHtml).find((list) => list.includes("Lint"));
    expect(failedVerifyLines).toMatch(/<li class="[^"]*text-destructive[^"]*" data-state="failed"[^>]*>.*?Lint.*?failed.*?<\/li>/);
    expect(failedVerifyLines).not.toContain('aria-label="Failed"');
  });

  it("renders nested lines without status glyphs while preserving top-level phase ticks", () => {
    const verifying = frames.find((frame) => frame.structured_output.phase === "verify");
    if (!verifying) throw new Error("no verification frame");
    const html = render(payload({ frames: [verifying], latest: verifying }));
    const nested = phaseLines(html).join("");

    expect(nested).not.toMatch(/aria-label="Done"|aria-label="Failed"|animate-spin|bg-success/);
    expect(html).toMatch(/<li class="[^"]*" data-state="done"><span class="[^"]*bg-success[^"]*"><svg[^>]*aria-label="Done"/);
  });

  it("uses tree connectors with exactly one last-line connector per nested list", () => {
    const verifying = frames.find((frame) => frame.structured_output.phase === "verify");
    if (!verifying) throw new Error("no verification frame");
    const verifyLines = phaseLines(render(payload({ frames: [verifying], latest: verifying })))
      .find((list) => list.includes("Lint"));
    if (!verifyLines) throw new Error("no verify phase lines");
    const lines = [...verifyLines.matchAll(/<li\b[^>]*>.*?<\/li>/g)].map((match) => match[0]);

    expect(verifyLines.match(/├─/g)).toHaveLength(lines.length - 1);
    expect(verifyLines.match(/└─/g)).toHaveLength(1);
    expect(lines.at(-1)).toContain("└─");
  });

  it("renders notes under their phase before artifacts and tolerates output without notes", () => {
    const baseline = frames.find((frame) => frame.structured_output.phase === "baseline");
    const pullRequest = frames.find((frame) => frame.structured_output.phase === "pull_request");
    if (!baseline || !pullRequest) throw new Error("missing scripted note frames");
    const baselineNote = "Ran pnpm verify at the base: all 68 tests pass";
    const verifyNote = "Opened localhost:3001/t/refunds and saw the held refunds with a Held chip";
    const baselineHtml = render(payload({ frames: [baseline], latest: baseline }));
    const baselineLines = phaseLines(baselineHtml).find((list) => list.includes(baselineNote));
    expect(baselineLines).toContain(baselineNote);
    const baselineListStart = baselineHtml.indexOf('data-testid="phase-lines"');
    const baselinePhaseStart = baselineHtml.lastIndexOf("<li ", baselineListStart);
    expect(baselineHtml.slice(baselinePhaseStart, baselineListStart)).toContain("Confirmed the base");

    const verifyHtml = render(payload({ frames: [pullRequest], latest: pullRequest }));
    const verifyLines = phaseLines(verifyHtml).find((list) => list.includes(verifyNote));
    expect(verifyLines).toContain(verifyNote);
    expect(verifyLines?.indexOf(verifyNote)).toBeLessThan(verifyLines?.indexOf("Lint") ?? -1);
    const verifyNoteIndex = verifyHtml.indexOf(verifyNote);
    const verifyListStart = verifyHtml.lastIndexOf("<ul ", verifyNoteIndex);
    const verifyPhaseStart = verifyHtml.lastIndexOf("<li ", verifyListStart);
    expect(verifyHtml.slice(verifyPhaseStart, verifyListStart)).toContain("Verified");

    const withoutNotes = {
      ...frames[0]!,
      structured_output: { ...frames[0]!.structured_output, notes: undefined },
    };
    const noNotesHtml = render(payload({ frames: [withoutNotes], latest: withoutNotes }));
    expect(phaseLines(noNotesHtml).join("")).not.toContain(baselineNote);
    expect(phaseLines(noNotesHtml).join("")).not.toContain(verifyNote);
  });

  it("spins on the first step while a running session has reported no phase", () => {
    const html = render(payload({ frames: [], latest: null, devinMessage: "Starting run", sessionStatusDetail: "working" }));
    expect(html.match(/data-state="active"/g)).toHaveLength(1);
    expect(html).toMatch(/data-state="active"><span role="status" aria-label="In progress" class="[^"]*animate-spin[^"]*"><\/span><span[^>]*>Read the evidence/);
    expect(html).toContain("Starting run");
  });

  it("does not spin on the first step while a phaseless session waits for a reply", () => {
    const html = render(payload({ frames: [], latest: null, sessionStatusDetail: "waiting_for_user" }));
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain('data-state="active"');
  });

  it("does not spin while Devin waits for a reply", () => {
    const last = editing.at(-1);
    if (!last) throw new Error("no frame");
    const waiting = {
      ...last,
      structured_output: { ...last.structured_output, phase_status: "waiting_for_user" as const },
    };
    const html = render(payload({ frames: [...editing.slice(0, -1), waiting], latest: waiting }));
    expect(html).not.toContain("animate-spin");
    expect(html).toMatch(/data-state="active"><span class="[^"]*"><span class="[^"]*bg-warning" aria-label="Paused"/);
  });

  it("stops spinning and shows the last update once the run has ended", () => {
    const p = payload();
    const html = render({ ...p, run: { ...p.run, status: "stopped" } });
    expect(html).toContain("Devin’s last update");
    expect(html).not.toContain("animate-spin");
    expect(html).toMatch(/data-state="active"><span class="[^"]*"><span class="[^"]*bg-warning" aria-label="Paused"/);
  });
});
