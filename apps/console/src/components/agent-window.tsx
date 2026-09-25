"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@console/ui/dialog";
import { formatRelative } from "@console/ui/format";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import type { DevinRun } from "@console/tool-automation";
import { HandoffPanel } from "@/components/handoff-panel";
import { Panel } from "@/components/panel";
import { RunView } from "@/components/run-view";
import { useWorkspace } from "@/components/workspace";
import { shouldToggleAgentWindow } from "@/lib/agent-window-shortcut";
import type { BridgeMode } from "@/lib/bridge";

/** What the window needs from the server; plain data only. */
export interface AgentWindowProps {
  mode: BridgeMode;
  /** Latest in-flight run, else null. */
  inFlight: DevinRun | null;
  /** Latest merged run, else null. */
  lastMerged: DevinRun | null;
}

const MODE_LABEL = { live: "Live", replay: "Replay" } as const;

function Content({ mode, inFlight, lastMerged }: AgentWindowProps) {
  const { agentFocus, setAgentFocus } = useWorkspace();

  if (agentFocus?.kind === "handoff") {
    return <HandoffPanel offer={agentFocus.offer} />;
  }

  const focusRunId = agentFocus?.kind === "run" ? agentFocus.runId : null;
  const runId = focusRunId ?? inFlight?.id ?? null;
  if (runId) {
    return <RunView key={runId} runId={runId} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <Icon name="Bot" className="size-5 text-muted-foreground" />
      <div className="text-xs text-muted-foreground">No run in flight</div>
      {lastMerged ? (
        <button
          type="button"
          onClick={() => setAgentFocus({ kind: "run", runId: lastMerged.id })}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Last merged: <span className="font-mono">{lastMerged.spec}</span> ·{" "}
          {formatRelative(lastMerged.updatedAt)}
        </button>
      ) : null}
      <Link href="/runs" className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        All runs
      </Link>
      {mode === "replay" ? (
        <div className="text-[10px] text-muted-foreground/70">Replay: scripted session, no key configured</div>
      ) : null}
    </div>
  );
}

/**
 * Devin's work shows in a centred modal window rather than a column. The
 * header button or `]` toggles it; Esc, the close button, or `]` closes it.
 * "Ask Devin" buttons open it by focusing a handoff or a run. Open state is
 * shared through the workspace so focusing can reveal the window.
 */
export function AgentWindow(props: AgentWindowProps) {
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

  const focusRunId = agentFocus?.kind === "run" ? agentFocus.runId : null;
  const runId = focusRunId ?? props.inFlight?.id ?? null;
  const source =
    agentFocus?.kind === "handoff"
      ? "context preview"
      : runId === null
        ? "none"
        : runId === props.inFlight?.id
          ? props.mode === "live"
            ? "session"
            : "scripted replay"
          : "default branch";

  return (
    <>
      <button
        type="button"
        onClick={toggleAgent}
        aria-pressed={agentOpen}
        title="Toggle Devin window (])"
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border border-input px-2 text-[11px]",
          agentOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon name="Bot" className="size-3.5" />
        Devin
      </button>
      <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Devin</DialogTitle>
          <Panel
            title="Devin"
            actions={
              <span className="mr-6 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span
                  className={cn(
                    "rounded px-1 font-medium",
                    props.mode === "live" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400",
                  )}
                >
                  {MODE_LABEL[props.mode]}
                </span>
                source: {source}
              </span>
            }
            className="h-[70vh] rounded-none border-0"
            bodyClassName="flex flex-col"
          >
            <Content {...props} />
          </Panel>
        </DialogContent>
      </Dialog>
    </>
  );
}
