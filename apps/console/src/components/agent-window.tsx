"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@console/ui/dialog";
import { Icon } from "@console/ui/icon";
import { Panel } from "@/components/panel";
import { shouldToggleAgentWindow } from "@/lib/agent-window-shortcut";
import type { DevinMode } from "@/lib/devin-status";
import { cn } from "@console/ui/utils";
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
 * Devin's work shows in a centred modal window rather than a column. The
 * header button or `]` toggles it; Esc, the close button, or `]` closes it.
 * "Ask Devin" buttons open it by focusing a handoff or a run. Open state is
 * shared through the workspace so focusing can reveal the window. The empty
 * state is rendered on the server and mounts into `children`; `source`
 * names where it comes from, and simulation mode is marked on the button.
 */
export function AgentWindow({
  children,
  mode = "live",
  source = "source: none",
}: {
  children?: React.ReactNode;
  mode?: DevinMode;
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
      ? "source: context preview"
      : agentFocus?.kind === "run"
        ? "source: run view"
        : source;

  return (
    <>
      <button
        type="button"
        onClick={toggleAgent}
        aria-pressed={agentOpen}
        title={mode === "simulation" ? "Toggle Devin window (]) · simulation mode" : "Toggle Devin window (])"}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border border-input px-2 text-[11px]",
          agentOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon name="Bot" className="size-3.5" />
        Devin
        {mode === "simulation" ? (
          <span
            className="rounded-sm bg-amber-500/15 px-1 font-mono text-[9px] tracking-wider text-amber-300"
            data-testid="devin-simulation-chip"
          >
            SIM
          </span>
        ) : null}
      </button>
      <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Devin</DialogTitle>
          <Panel
            title="Devin"
            actions={<span className="mr-6 text-[10px] text-muted-foreground">{label}</span>}
            className="h-[70vh] rounded-none border-0"
            bodyClassName="flex flex-col"
          >
            <AgentWindowContent>{children}</AgentWindowContent>
          </Panel>
        </DialogContent>
      </Dialog>
    </>
  );
}
