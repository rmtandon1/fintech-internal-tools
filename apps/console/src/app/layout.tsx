import "@/app/bootstrap";
import type { Metadata } from "next";
import { Toaster } from "@console/ui/sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { AgentColumn, AgentColumnSheet } from "@/components/agent-column";
import {
  CommandPaletteProvider,
  type PaletteMode,
} from "@/components/command-palette";
import {
  AgentColumnToggle,
  WorkspacePanes,
  WorkspaceProvider,
} from "@/components/workspace";
import { countPendingFor } from "@console/engine/approvals";
import { verifyChain } from "@console/engine/audit/verify";
import { automationTool } from "@console/tool-automation";
import { OPS_MODES } from "@/lib/modes";
import { currentActor } from "@/lib/session";
import {
  WORKSPACE_LAYOUT_COOKIE,
  parseWorkspaceLayout,
} from "@/lib/workspace-layout";
import { getTool, toolsForRole } from "@/registry";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fintech Tools",
  description: "Governed internal operations console",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const actor = await currentActor();
  const visible = toolsForRole(actor.role);
  // Automation runs are reached through RUNS, not a generic tool list.
  const tools = visible
    .filter((t) => t.name !== automationTool.name)
    .map((t) => ({ name: t.name, displayName: t.displayName, icon: t.icon }));
  const runs = visible.some((t) => t.name === automationTool.name);
  const pending = countPendingFor(actor);
  const chain = verifyChain();
  const layout = parseWorkspaceLayout(
    (await cookies()).get(WORKSPACE_LAYOUT_COOKIE)?.value,
  );

  const modes: PaletteMode[] = OPS_MODES.flatMap((mode) => {
    const decl = getTool(mode.id);
    // A registered tool this role cannot see has no page at all; roadmap
    // only exists for unregistered modes, so the entry is omitted.
    if (decl !== undefined && !decl.visibleTo.includes(actor.role)) return [];
    const live = decl !== undefined;
    return [{
      id: mode.id,
      name: decl?.displayName ?? mode.name,
      description: decl?.description ?? mode.description,
      icon: decl?.icon ?? mode.icon,
      actions: decl ? decl.actions.map((a) => a.name) : mode.actions,
      roles: mode.roles,
      live,
      href: live ? `/t/${mode.id}` : `/roadmap/${mode.id}`,
    }];
  });

  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-background text-foreground antialiased">
        <CommandPaletteProvider modes={modes}>
          <div className="flex h-full">
            <AppSidebar actor={actor} tools={tools} runs={runs} pendingApprovals={pending} />
            <WorkspaceProvider initialLayout={layout}>
              <div className="flex min-w-0 flex-1 flex-col">
                <AppHeader
                  actor={actor}
                  chainOk={chain.ok}
                  chainLength={chain.length}
                  agent={
                    <>
                      <AgentColumnSheet />
                      <AgentColumnToggle />
                    </>
                  }
                />
                <WorkspacePanes initialLayout={layout} agent={<AgentColumn />}>
                  {children}
                </WorkspacePanes>
              </div>
            </WorkspaceProvider>
          </div>
        </CommandPaletteProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
