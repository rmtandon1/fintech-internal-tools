import "@/app/bootstrap";
import type { Metadata } from "next";
import { Toaster } from "@console/ui/sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { AgentWindow } from "@/components/agent-window";
import { DevinWindowBody } from "@/components/devin-window-body";
import {
  CommandPaletteProvider,
  type PaletteMode,
} from "@/components/command-palette";
import { countPendingFor } from "@console/engine/approvals";
import { verifyChain } from "@console/engine/audit/verify";
import { automationTool } from "@console/tool-automation";
import { devinMode } from "@/lib/devin-status";
import { modesFor } from "@/lib/modes";
import { currentActor } from "@/lib/session";
import { toolsForRole } from "@/registry";
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
  const mode = devinMode();

  const modes: PaletteMode[] = modesFor(actor.role).map((mode) => ({
    id: mode.id,
    name: mode.name,
    description: mode.description,
    icon: mode.icon,
    actions: mode.actions,
    roles: mode.roles,
    live: mode.live,
    href: mode.href,
  }));

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-screen overflow-hidden bg-background text-foreground antialiased">
        <CommandPaletteProvider modes={modes}>
          <div className="flex h-full">
            <AppSidebar actor={actor} tools={tools} runs={runs} pendingApprovals={pending} />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader
                actor={actor}
                chainOk={chain.ok}
                chainLength={chain.length}
                agent={
                  <AgentWindow
                    mode={mode}
                    source={mode === "simulation" ? "source: simulation (pre-written)" : "source: devin_runs"}
                  >
                    <DevinWindowBody actor={actor} mode={mode} />
                  </AgentWindow>
                }
              />
              <main className="min-h-0 flex-1 overflow-hidden p-3">{children}</main>
            </div>
          </div>
        </CommandPaletteProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
