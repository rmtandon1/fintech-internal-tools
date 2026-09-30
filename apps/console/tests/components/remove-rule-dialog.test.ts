import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { REFUND_CLUSTERING_HOLD } from "@console/tool-automation";
import type { RemovalPreview } from "@console/tool-automation/removal-preview";

vi.mock("@/app/automation-actions", () => ({ dispatchAutomationRun: vi.fn(), previewRuleRemoval: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RemovalPreviewBody, RemoveRuleButton } from "@/components/remove-rule-dialog";
import { WorkspaceProvider } from "@/components/workspace";

const preview: RemovalPreview = {
  runId: "01RUN",
  request: REFUND_CLUSTERING_HOLD.intents.change,
  askedBy: "Manager",
  prNumber: 42,
  prUrl: "https://github.com/o/r/pull/42",
  mergeCommit: "d".repeat(40),
  mergedAt: Date.UTC(2026, 8, 30, 9, 30),
  files: [
    { path: "tools/refunds/src/clustering-hold.ts", additions: 40, deletions: 2 },
    { path: "apps/console/tests/tools/refunds-clustering-hold.test.ts", additions: 25, deletions: 0 },
  ],
  tests: ["apps/console/tests/tools/refunds-clustering-hold.test.ts"],
  settings: ["refunds.clustering_window_days"],
  changedSince: [{ sha: "e".repeat(40), committedAt: 1, subject: "Tighten the hold (#57)", prNumber: 57 }],
  nextStep: "Devin opens a pull request that takes this rule out, keeping the one change made since, and an engineer reviews it before anything changes here.",
};

describe("RemovalPreviewBody", () => {
  it("shows what it is, what it touched, what changed since and what happens next", () => {
    const html = renderToStaticMarkup(createElement(RemovalPreviewBody, { preview }));
    expect(html).toContain("What it is");
    expect(html).toContain("send them to a manager for approval");
    expect(html).toContain("Asked by Manager");
    expect(html).toContain('href="https://github.com/o/r/pull/42"');
    expect(html).toContain("PR #42");
    expect(html).toContain("merged 30 Sept 2026");
    expect(html).toContain("What it touched");
    expect(html).toContain("tools/refunds/src/clustering-hold.ts");
    expect(html).toContain("+40");
    expect(html).toContain("−2");
    expect(html).toContain("1 test file added or changed");
    expect(html).toContain("refunds.clustering_window_days");
    expect(html).toContain("Changed since");
    expect(html).toContain("eeeeeee");
    expect(html).toContain("Tighten the hold (#57)");
    expect(html).toContain("PR #57");
    expect(html).toContain("Devin keeps these");
    expect(html).toMatch(/data-testid="removal-next">Devin opens a pull request/);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("What Devin will see");
  });

  it("says when nothing changed since and when the merge is not local yet", () => {
    const quiet = renderToStaticMarkup(
      createElement(RemovalPreviewBody, { preview: { ...preview, changedSince: [], tests: [], settings: [] } }),
    );
    expect(quiet).toContain("Nothing else has touched these files since.");
    expect(quiet).toContain("No tests added or changed");
    expect(quiet).toContain("no settings declared");
    const notLocal = renderToStaticMarkup(
      createElement(RemovalPreviewBody, { preview: { ...preview, mergedAt: null, files: [] } }),
    );
    expect(notLocal).toContain("not in this checkout yet");
  });
});

describe("RemoveRuleButton", () => {
  it("renders the trigger with the dialog closed", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceProvider, null, createElement(RemoveRuleButton, { runId: "01RUN" }, "Remove…")),
    );
    expect(html).toMatch(/data-testid="remove-rule"[^>]*>Remove…</);
    expect(html).not.toContain("Ask Devin to remove it");
  });
});
