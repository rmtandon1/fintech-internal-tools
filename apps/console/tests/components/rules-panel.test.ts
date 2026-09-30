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
import { MANAGER_APPROVAL_USD_KEY, refundTool } from "@console/tool-refunds";
import { kycTool } from "@console/tool-kyc";
import { admin, analyst, manager, setupHarness } from "../helpers/harness";

vi.mock("@/app/automation-actions", () => ({ dispatchAutomationRun: vi.fn(), previewRuleRemoval: vi.fn() }));
vi.mock("@/app/actions", () => ({ submitIntent: vi.fn(), updateConstant: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RULES_SUBTITLE, RulesPanel } from "@/components/rules-panel";
import { WorkspaceProvider } from "@/components/workspace";

/** The refund hold's on/off switch, as its spec names it. */
const SWITCH = REFUND_CLUSTERING_HOLD.switchSetting ?? "refunds.clustering_hold";

/**
 * The refunds tool as it stands once the refund hold has merged: the hold
 * declares its switch, off by default. Declared here so these tests don't
 * depend on the hold being in the codebase.
 */
const refunds: ToolDeclaration = {
  ...refundTool,
  constants: [
    ...(refundTool.constants ?? []).filter((c) => c.key !== SWITCH),
    {
      key: SWITCH,
      value: false,
      type: "boolean",
      description: "Holds a merchant's not-received refunds for a manager once together they pass the manager limit.",
      tool: "refunds",
    },
  ],
};

function render(decl: ToolDeclaration, actor: typeof admin): string {
  return renderToStaticMarkup(
    createElement(WorkspaceProvider, null, createElement(RulesPanel, { decl, actor })),
  );
}

function card(html: string, key = SWITCH): string {
  return new RegExp(`<li[^>]*data-testid="devin-rule"[^>]*data-key="${key.replace(".", "\\.")}"[^>]*>.*?</li>`).exec(html)?.[0] ?? "";
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
      requestedAt: Date.UTC(2026, 8, 30, 9, 30),
      updatedAt: Date.UTC(2026, 8, 30, 9, 30),
      version: 1,
      ...overrides,
    })
    .run();
}

beforeAll(() => {
  setupHarness();
  registerConstants([...(refunds.constants ?? []), ...(kycTool.constants ?? [])]);
});

describe("RulesPanel", () => {
  it("is the #rules region: subtitle, then Limits by label with money in dollars and no raw keys; only admins get the Edit link", () => {
    setConstant(admin, MANAGER_APPROVAL_USD_KEY, "77700");
    for (const viewer of [admin, manager, analyst]) {
      const html = render(refunds, viewer);
      expect(html).toContain('id="rules"');
      expect(html).toContain(RULES_SUBTITLE);
      expect(html).toContain(">Limits<");
      expect(html).toContain(">Manager approval limit<");
      expect(html).toContain("Refunds of this amount or more need a manager");
      expect(html).toMatch(/data-testid="rule-value">\$777\.00</);
      expect(html).not.toContain("<input");
      expect(html).not.toContain(">Save<");
      // The key survives only as a tooltip.
      expect(html).toContain(`title="${MANAGER_APPROVAL_USD_KEY}"`);
      expect(html).not.toMatch(new RegExp(`>${MANAGER_APPROVAL_USD_KEY.replace(".", "\\.")}<`));
      expect(html).toContain('data-testid="no-devin-rules"');
      if (viewer === admin) expect(html).toMatch(/data-testid="edit-setting"[^>]*>Edit</);
      else expect(html).not.toContain('data-testid="edit-setting"');
    }
  });

  it("shows a list setting as chips", () => {
    const html = render(kycTool, manager);
    expect(html).toContain(">Blocked countries<");
    for (const code of ["IR", "KP", "SY", "CU"]) expect(html).toMatch(new RegExp(`rounded-full[^>]*>${code}<`));
    expect(html).toContain(">Manager review from risk score<");
    expect(html).toMatch(/data-testid="rule-value">70</);
  });

  it("shows a merged change run's switch as a card Devin added: name, description, toggle, provenance, PR button and Remove…", () => {
    insertRun({});
    setConstant(admin, SWITCH, "true");
    const html = render(refunds, admin);
    expect(html).toContain(">Added by Devin<");
    const row = card(html);
    expect(row).toContain("Refund hold");
    expect(row).toContain("Holds a merchant");
    expect(row).toContain("Added by Devin · asked by Manager · 30 Sept 2026");
    expect(row).toMatch(/data-testid="pr-button"[^>]*>.*?PR #42/);
    expect(row).toContain('href="https://github.com/o/r/pull/42"');
    expect(row).toMatch(/data-testid="rule-on-off">On</);
    expect(row).toMatch(/data-testid="rule-toggle"/);
    expect(row).toMatch(/data-testid="remove-rule"[^>]*>Remove…</);
    expect(row).not.toContain("line-through");
    expect(row).not.toContain(">Save<");
    // The manager gets the same live switch and Remove…; the server still checks.
    const managerRow = card(render(refunds, manager));
    expect(managerRow).toMatch(/data-testid="rule-toggle"/);
    expect(managerRow).not.toMatch(/disabled=""[^>]*data-testid="rule-toggle"/);
    expect(managerRow).toMatch(/data-testid="remove-rule"/);

    setConstant(admin, SWITCH, "false");
    expect(card(render(refunds, admin))).toMatch(/data-testid="rule-on-off">Off</);
  });

  it("shows an amber banner with the toggle disabled while the undo is in flight, then moves the rule to Recently removed with no strikethrough", () => {
    insertRun({ id: "01UNDO", operation: "undo", status: "running", reverses: "01RUN", prUrl: "https://github.com/o/r/pull/57", mergeCommit: null });
    const inReview = render(refunds, admin);
    const row = card(inReview);
    expect(row).toContain('data-state="removal_in_review"');
    expect(row).toMatch(/data-testid="removal-banner"[^>]*>.*?Devin is removing this rule ·.*?PR #57.*?in review/);
    expect(row).toMatch(/disabled=""[^>]*data-testid="rule-toggle"/);
    expect(row).not.toContain('data-testid="remove-rule"');

    db.update(devinRuns)
      .set({ status: "merged", mergeCommit: "e".repeat(40), updatedAt: Date.UTC(2026, 9, 2, 12) })
      .where(eq(devinRuns.id, "01UNDO"))
      .run();
    const gone: ToolDeclaration = {
      ...refunds,
      constants: (refundTool.constants ?? []).filter((c) => c.key !== SWITCH),
    };
    const removed = render(gone, admin);
    expect(card(removed)).toBe("");
    expect(removed).toContain("Recently removed (1)");
    const line = /<li[^>]*data-testid="removed-rule"[^>]*>(.*?)<\/li>/.exec(removed)?.[1] ?? "";
    expect(line).toContain("Refund hold");
    expect(line).toContain("· removed by Devin ·");
    expect(line).toContain("PR #57");
    expect(line).toContain("2 Oct 2026");
    expect(line).not.toContain("PR #42");
    expect(removed).not.toContain("line-through");
    expect(removed).not.toContain('data-testid="remove-rule"');
  });

  it("puts an admin action on its rule's card, keeps others in the header, and renders nothing for a tool with no rules", () => {
    const withActions: ToolDeclaration = {
      ...refunds,
      adminActions: [
        { label: "Recheck now", action: "recheck", setting: MANAGER_APPROVAL_USD_KEY },
        { label: "Rebuild index", action: "rebuild" },
      ],
    };
    const html = render(withActions, manager);
    const limit = /<li[^>]*data-key="refunds\.manager_approval_usd_minor"[^>]*>.*?<\/li>/.exec(html)?.[0] ?? "";
    expect(limit).toMatch(/data-testid="admin-action"[^>]*>Recheck now</);
    expect(limit).not.toContain("Rebuild index");
    expect(html).toMatch(/data-testid="admin-action"[^>]*>Rebuild index</);
    const bare: ToolDeclaration = { ...refunds, name: "bare", constants: [] };
    expect(render(bare, admin)).toBe("");
  });
});
