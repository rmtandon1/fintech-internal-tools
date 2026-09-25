import "@/app/bootstrap";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
import { BRAND } from "@/lib/brand";
import { chosenRole, currentActor } from "@/lib/session";
import { toolsForRole } from "@/registry";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

export const dynamic = "force-dynamic";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const actor = await currentActor();
  // Until a role is picked, the rail offers only Home, where picking an app picks one.
  const role = await chosenRole();
  const visible = role ? toolsForRole(actor.role) : [];
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
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="h-screen overflow-hidden bg-background font-sans text-foreground antialiased">
        <CommandPaletteProvider modes={modes}>
          <div className="flex h-full">
            <AppSidebar actor={actor} roleChosen={role !== null} tools={tools} runs={runs} pendingApprovals={pending} />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader
                actor={actor}
                roleChosen={role !== null}
                chainOk={chain.ok}
                chainLength={chain.length}
                agent={
                  // Keyed: an element built here and rendered among the header's
                  // children otherwise trips React's list-key warning in dev.
                  <AgentWindow
                    key="devin-window"
                    mode={mode}
                    source={mode === "simulation" ? "Preview" : "Connected"}
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
