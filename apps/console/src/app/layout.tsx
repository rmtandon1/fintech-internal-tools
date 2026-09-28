import "@/app/bootstrap";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@console/ui/sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { AgentWindow } from "@/components/agent-window";
import { DevinWindowBody } from "@/components/devin-window-body";
import { countPendingFor } from "@console/engine/approvals";
import { automationTool } from "@console/tool-automation";
import { enabledFlagKeys } from "@console/tool-flags";
import { OPS_MODES } from "@/lib/modes";
import { WorkspaceProvider } from "@/components/workspace";
import { devinMode } from "@/lib/devin-status";
import { BRAND } from "@/lib/brand";
import { currentTheme } from "@/lib/theme";
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
  const theme = await currentTheme();
  // Until a role is picked, the rail offers only Home, where picking an app picks one.
  const role = await chosenRole();
  const visible = role ? toolsForRole(actor.role) : [];
  // Automation runs are reached through RUNS, not a generic tool list.
  // A registered tool behind an off feature flag is switched off: keep it out
  // of the rail; its roadmap page explains where to turn it on.
  const flags = enabledFlagKeys();
  const tools = visible
    .filter((t) => t.name !== automationTool.name)
    .filter((t) => {
      const mode = OPS_MODES.find((m) => m.id === t.name);
      return !mode?.flag || flags.has(mode.flag);
    })
    .map((t) => ({ name: t.name, displayName: t.displayName, icon: t.icon }));
  const runs = visible.some((t) => t.name === automationTool.name);
  const pending = countPendingFor(actor);
  const mode = devinMode();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}${theme === "dark" ? " dark" : ""}`}
    >
      <body className="h-screen overflow-hidden bg-background font-sans text-foreground antialiased">
        <div className="flex h-full">
          <WorkspaceProvider>
            <AppSidebar actor={actor} roleChosen={role !== null} tools={tools} runs={runs} pendingApprovals={pending} />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader actor={actor} roleChosen={role !== null} />
              <main className="min-h-0 flex-1 overflow-hidden p-4">{children}</main>
            </div>
            <AgentWindow source={mode === "simulation" ? "Not connected" : "Connected"}>
              <DevinWindowBody actor={actor} mode={mode} />
            </AgentWindow>
          </WorkspaceProvider>
        </div>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
