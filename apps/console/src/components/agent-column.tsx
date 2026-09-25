"use client";

import Link from "next/link";
import { Icon } from "@console/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@console/ui/sheet";
import { HandoffPanel } from "@/components/handoff-panel";
import { Panel } from "@/components/panel";
import { RunView } from "@/components/run-view";
import { useWorkspace } from "@/components/workspace";
import type { BridgeMode } from "@/lib/bridge";
import type { DevinRun } from "@console/tool-automation";
import { cn } from "@console/ui/utils";
import { formatRelative } from "@console/ui/format";

/** What the column needs from the server; plain data only. */
export interface AgentColumnProps {
  mode: BridgeMode;
  /** Latest in-flight run, else null. */
  inFlight: DevinRun | null;
  /** Latest merged run, else null. */
  lastMerged: DevinRun | null;
}

const MODE_LABEL = { live: "Live", replay: "Replay" } as const;

function Content({ mode, inFlight, lastMerged }: AgentColumnProps) {
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

function Body({
  className,
  ...props
}: AgentColumnProps & { className?: string }) {
  const { agentFocus } = useWorkspace();
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
    <Panel
      title="Devin"
      actions={
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
      className={cn("min-h-0", className)}
      bodyClassName="flex flex-col"
    >
      <Content {...props} />
    </Panel>
  );
}

/**
 * The right-hand column where Devin's work shows: a handoff being composed,
 * a run in flight, or run history. Below `lg` it opens as a sheet instead.
 */
export function AgentColumn(props: AgentColumnProps) {
  return (
    <aside className="flex h-full flex-col p-3 pl-0">
      <Body className="flex-1" {...props} />
    </aside>
  );
}

export function AgentColumnSheet(props: AgentColumnProps) {
  const { agentSheetOpen, setAgentSheetOpen } = useWorkspace();
  return (
    <Sheet open={agentSheetOpen} onOpenChange={setAgentSheetOpen}>
      <SheetTrigger
        className="flex h-7 items-center gap-1.5 rounded-md border border-input px-2 text-[11px] text-muted-foreground hover:text-foreground lg:hidden"
        title="Devin"
      >
        <Icon name="Bot" className="size-3.5" />
        Devin
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] gap-0 p-3 sm:max-w-sm">
        <SheetTitle className="sr-only">Devin</SheetTitle>
        <Body className="h-full" {...props} />
      </SheetContent>
    </Sheet>
  );
}
