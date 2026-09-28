"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@console/ui/dialog";
import { Panel } from "@/components/panel";
import { shouldToggleAgentWindow } from "@/lib/agent-window-shortcut";
import { HandoffPanel } from "@/components/handoff-panel";
import { RunView } from "@/components/run-view";
import { useWorkspace } from "@/components/workspace";

/**
 * What the window shows for the current focus: a handoff, a run, or the
 * server-rendered empty state (`children`, upstream's DevinWindowBody).
 */
function AgentWindowContent({ children }: { children?: React.ReactNode }) {
  const { agentFocus } = useWorkspace();
  if (agentFocus?.kind === "handoff") {
    return <HandoffPanel offer={agentFocus.offer} />;
  }
  if (agentFocus?.kind === "run") {
    return <RunView key={agentFocus.runId} runId={agentFocus.runId} />;
  }
  return <>{children}</>;
}

/**
 * Devin's work shows in a centred modal window rather than a column. `]`
 * toggles it; Esc, the close button, or `]` closes it. "Ask Devin" buttons
 * open it by focusing a handoff or a run. Open state is shared through the
 * workspace so focusing can reveal the window. The empty state is rendered
 * on the server and mounts into `children`; `source` labels where it comes
 * from.
 */
export function AgentWindow({
  children,
  source = "",
}: {
  children?: React.ReactNode;
  source?: string;
}) {
  const { agentOpen, setAgentOpen, toggleAgent, agentFocus } = useWorkspace();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldToggleAgentWindow(event.key, target)) return;
      toggleAgent();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleAgent]);

  const label =
    agentFocus?.kind === "handoff"
      ? "Request"
      : agentFocus?.kind === "run"
        ? "Live run"
        : source;

  return (
    <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Devin</DialogTitle>
        <Panel
          title="Devin"
          actions={<span className="mr-6 text-[10px] text-muted-foreground">{label}</span>}
          className="h-[80vh] rounded-none border-0"
          bodyClassName="flex flex-col"
        >
          <AgentWindowContent>{children}</AgentWindowContent>
        </Panel>
      </DialogContent>
    </Dialog>
  );
}
