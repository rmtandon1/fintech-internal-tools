import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { REFUND_CLUSTERING_HOLD } from "@console/tool-automation";

vi.mock("@/app/automation-actions", () => ({ dispatchAutomationRun: vi.fn() }));

import { HandoffPanel } from "@/components/handoff-panel";
import { WorkspaceProvider } from "@/components/workspace";
import type { HandoffOffer } from "@/lib/handoff";

const offer: HandoffOffer = {
  spec: REFUND_CLUSTERING_HOLD.file,
  operation: "change",
  operationLabel: "Change",
  title: REFUND_CLUSTERING_HOLD.title,
  description: REFUND_CLUSTERING_HOLD.description,
  intent: REFUND_CLUSTERING_HOLD.intents.change,
  evidenceKey: "mrc_1",
  evidenceIds: ["ref_1"],
  evidence: [{ id: "ref_1", facts: { amountUsd: 120 } }],
  constants: { manager_approval_usd: 500 },
  base: { branch: "main", commit: "0123456789abcdef0123456789abcdef01234567" },
  allowedPaths: ["tools/refunds/src/clustering-hold.ts"],
  evidenceLabels: {},
  live: true,
  reverses: null,
};

function render(o: HandoffOffer): string {
  return renderToStaticMarkup(
    createElement(WorkspaceProvider, null, createElement(HandoffPanel, { offer: o })),
  );
}

describe("HandoffPanel", () => {
  it("shows the evidence, the editable request and the send button", () => {
    const html = render(offer);
    expect(html).toContain("What Devin will see");
    expect(html).toContain("ref_1");
    expect(html).toContain("The request");
    expect(html).toContain("Send to Devin");
  });

  it("a change offer renders an empty request box with the spec's sentence as a grey suggestion Tab accepts", () => {
    const html = render(offer);
    expect(html).toContain('id="handoff-intent"');
    expect(html).toContain('placeholder="If a merchant');
    expect(html).not.toContain(`>${REFUND_CLUSTERING_HOLD.intents.change}</textarea>`);
    expect(html).toContain(">Tab</kbd>");
    expect(html).toContain('aria-label="Intent"');
  });

  it("an undo offer renders the intent read-only", () => {
    const html = render({
      ...offer,
      operation: "undo",
      operationLabel: "Undo a change",
      intent: REFUND_CLUSTERING_HOLD.intents.undo,
    });
    expect(html).toContain('readOnly=""');
    expect(html).toContain("Undo the refund hold");
    expect(html).toContain("An undo carries no free text.");
  });

  it("no longer shows the technical details", () => {
    const html = render(offer);
    expect(html).not.toContain("Technical details");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Allowed files");
    expect(html).not.toContain("tools/refunds/src/clustering-hold.ts");
    expect(html).not.toContain("main@0123456");
    expect(html).not.toContain("manager_approval_usd");
  });
});
