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
      "Holding the merchant's not-received refunds once together they pass the manager line, and sending those customers' KYC approvals to a manager.",
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
    expect(html).toMatch(/data-state="done"><span class="[^"]*text-emerald-400">✓/);
    expect(html).toMatch(/data-state="waiting"><span class="[^"]*">○/);
    expect(html).not.toContain("●");
  });

  it("stops spinning and shows the last update once the run has ended", () => {
    const p = payload();
    const html = render({ ...p, run: { ...p.run, status: "stopped" } });
    expect(html).toContain("Devin’s last update");
    expect(html).not.toContain("animate-spin");
    expect(html).toMatch(/data-state="active"><span class="[^"]*text-amber-400">●/);
  });
});
