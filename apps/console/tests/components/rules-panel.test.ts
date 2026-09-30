import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@console/db";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import type { ToolDeclaration } from "@console/engine/types";
import { REFUND_CLUSTERING_HOLD, type DevinRun } from "@console/tool-automation";
import { devinRuns } from "@console/tool-automation/schema";
import { CLUSTERING_WINDOW_DAYS_KEY, MANAGER_APPROVAL_USD_KEY, refundTool } from "@console/tool-refunds";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

vi.mock("@/app/automation-actions", () => ({ dispatchAutomationRun: vi.fn(), previewRuleRemoval: vi.fn() }));
vi.mock("@/app/actions", () => ({ submitIntent: vi.fn(), updateConstant: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RulesPanel } from "@/components/rules-panel";
import { WorkspaceProvider } from "@/components/workspace";

function render(decl: ToolDeclaration, actor: typeof admin): string {
  return renderToStaticMarkup(
    createElement(WorkspaceProvider, null, createElement(RulesPanel, { decl, actor })),
  );
}

function insertRun(overrides: Partial<DevinRun>): void {
  db.insert(devinRuns)
    .values({
      id: "01RUN",
      operation: "change",
      spec: REFUND_CLUSTERING_HOLD.file,
      tool: "refunds",
      intent: REFUND_CLUSTERING_HOLD.intents.change,
      contextSha256: "0".repeat(64),
      sessionId: null,
      sessionUrl: null,
      status: "merged",
      prUrl: "https://github.com/o/r/pull/42",
      mergeCommit: "d".repeat(40),
      reverses: null,
      requestedBy: "usr_manager",
      requestedByRole: "manager",
      approvedBy: "usr_engineer",
      lastNote: null,
      requestedAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      version: 1,
      ...overrides,
    })
    .run();
}

beforeAll(() => {
  setupHarness();
  registerConstants(refundTool.constants ?? []);
});

describe("RulesPanel", () => {
  it("is the #rules region listing the declared settings with live values, editable by an admin only", () => {
    setConstant(admin, MANAGER_APPROVAL_USD_KEY, "777");
    const adminHtml = render(refundTool, admin);
    expect(adminHtml).toContain('id="rules"');
    expect(adminHtml).toContain(MANAGER_APPROVAL_USD_KEY);
    expect(adminHtml).toContain('value="777"');
    expect(adminHtml).toContain(">Save<");
    for (const viewer of [analyst, manager]) {
      const html = render(refundTool, viewer);
      expect(html).toContain('id="rules"');
      expect(html).toMatch(/data-testid="rule-value">777</);
      expect(html).not.toContain(">Save<");
      expect(html).not.toContain('data-testid="remove-rule"');
      expect(html).not.toContain('data-testid="admin-action"');
    }
  });

  it("shows a merged change run's switch setting as a rule Devin added, with Remove… for the admin", () => {
    insertRun({});
    setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "30");
    const html = render(refundTool, admin);
    const row = /<li[^>]*data-key="refunds\.clustering_window_days"[^>]*>(.*?)<\/li>/.exec(html)?.[1] ?? "";
    expect(row).toContain("Refund clustering hold");
    expect(row).toContain("Added by Devin ·");
    expect(row).toContain("PR #42");
    expect(row).toContain('href="https://github.com/o/r/pull/42"');
    expect(row).toContain("asked by Manager");
    expect(row).toContain(">On<");
    expect(row).toContain(">Live<");
    expect(row).toMatch(/data-testid="remove-rule"[^>]*>Remove…</);
    expect(row).toContain(">Save<");
    expect(render(refundTool, manager)).not.toContain('data-testid="remove-rule"');

    setConstant(admin, CLUSTERING_WINDOW_DAYS_KEY, "0");
    expect(render(refundTool, admin)).toContain(">Off<");
  });

  it("shows Removal in review while the undo is in flight, then Removed · PR #N struck through with no editor", () => {
    insertRun({ id: "01UNDO", operation: "undo", status: "running", reverses: "01RUN", prUrl: null, mergeCommit: null });
    const inReview = render(refundTool, admin);
    expect(inReview).toContain("Removal in review");
    expect(inReview).not.toContain('data-testid="remove-rule"');

    db.update(devinRuns)
      .set({ status: "merged", prUrl: "https://github.com/o/r/pull/57", mergeCommit: "e".repeat(40) })
      .where(eq(devinRuns.id, "01UNDO"))
      .run();
    const gone: ToolDeclaration = {
      ...refundTool,
      constants: (refundTool.constants ?? []).filter((c) => c.key !== CLUSTERING_WINDOW_DAYS_KEY),
    };
    const removed = render(gone, admin);
    const row = /<li[^>]*data-key="refunds\.clustering_window_days"[^>]*>.*?<\/li>/.exec(removed)?.[0] ?? "";
    expect(row).toContain('data-state="removed"');
    expect(row).toContain(">Removed<");
    expect(row).toContain("PR #57");
    expect(row).toContain("PR #42");
    expect(row).toContain("line-through");
    expect(row).not.toContain(">Off<");
    expect(row).not.toContain(">Save<");
    expect(row).not.toContain('data-testid="remove-rule"');
  });

  it("renders the declaration's admin actions for the admin, and nothing for a tool with no rules", () => {
    const withActions: ToolDeclaration = {
      ...refundTool,
      adminActions: [{ label: "Recheck now", action: "recheck" }],
    };
    expect(render(withActions, admin)).toMatch(/data-testid="admin-action"[^>]*>Recheck now</);
    expect(render(withActions, manager)).not.toContain("Recheck now");
    const bare: ToolDeclaration = { ...refundTool, name: "bare", constants: [] };
    expect(render(bare, admin)).toBe("");
  });
});
