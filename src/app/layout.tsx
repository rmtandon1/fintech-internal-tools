import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { countPendingFor } from "@/engine/approvals";
import { verifyChain } from "@/engine/audit/verify";
import { currentActor } from "@/lib/session";
import { toolsForRole } from "@/tools";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian Ops Console",
  description: "Governed internal operations console",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const actor = await currentActor();
  const tools = toolsForRole(actor.role).map((t) => ({
    name: t.name,
    displayName: t.displayName,
    icon: t.icon,
  }));
  const pending = countPendingFor(actor);
  const chain = verifyChain();

  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        <div className="flex min-h-screen">
          <AppSidebar actor={actor} tools={tools} pendingApprovals={pending} />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader actor={actor} chainOk={chain.ok} chainLength={chain.length} />
            <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
          </div>
        </div>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
