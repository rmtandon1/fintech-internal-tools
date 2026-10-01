import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { REFUND_CLUSTERING_HOLD } from "@console/tool-automation";
import type { RemovalPreview } from "@console/tool-automation/removal-preview";

vi.mock("@/app/automation-actions", () => ({ dispatchAutomationRun: vi.fn(), previewRuleRemoval: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RemovalPreviewBody, RemoveRuleButton, WHAT_HAPPENS } from "@/components/remove-rule-dialog";
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

const rule = { name: "Refund hold", prNumber: 42, prUrl: "https://github.com/o/r/pull/42", askedAt: preview.mergedAt!, on: false };

describe("RemovalPreviewBody", () => {
  it("shows provenance with the PR button and current state, the request quoted, what happens, and the detail folded", () => {
    const html = renderToStaticMarkup(createElement(RemovalPreviewBody, { preview, rule }));
    expect(html).toContain("Added by Devin · asked by Manager ·");
    expect(html).toMatch(/data-testid="pr-button"[^>]*>.*?PR #42/);
    expect(html).toContain('href="https://github.com/o/r/pull/42"');
    expect(html).toContain("30 Sept 2026");
    expect(html).toMatch(/data-testid="removal-current-state"[^>]*>Off</);
    expect(html).toContain("send them all to a manager for approval");
    expect(html).toContain(">What happens<");
    for (const line of WHAT_HAPPENS) expect(html).toContain(line);
    expect(html).toMatch(/<details[^>]*data-testid="engineering-detail"/);
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain("tools/refunds/src/clustering-hold.ts");
    expect(html).toContain("+40");
    expect(html).toContain("−2");
    expect(html).toContain("1 test file added or changed");
    // Nothing engineering-flavoured escapes the fold.
    const outside = html.slice(0, html.indexOf("<details"));
    expect(outside).not.toContain("tools/refunds");
    expect(outside).not.toContain("ddddddd");
    expect(outside).not.toContain("01RUN");
    expect(html).not.toContain("Changed since");
    expect(html).not.toContain("Devin keeps these");
    expect(html).not.toContain("<textarea");
  });

  it("says when the merge is not local yet and when no tests changed", () => {
    const quiet = renderToStaticMarkup(
      createElement(RemovalPreviewBody, { preview: { ...preview, tests: [], settings: [] } }),
    );
    expect(quiet).toContain("No tests added or changed");
    const notLocal = renderToStaticMarkup(
      createElement(RemovalPreviewBody, { preview: { ...preview, mergedAt: null, files: [] } }),
    );
    expect(notLocal).toContain("not in this checkout yet");
  });
});

describe("RemoveRuleButton", () => {
  it("renders the trigger with the dialog closed", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceProvider, null, createElement(RemoveRuleButton, { runId: "01RUN", rule }, "Remove…")),
    );
    expect(html).toMatch(/data-testid="remove-rule"[^>]*>Remove…</);
    expect(html).not.toContain("Remove rule<");
    expect(html).not.toContain("Remove Refund hold?");
  });
});
