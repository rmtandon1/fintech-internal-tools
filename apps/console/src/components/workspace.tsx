"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
  type PanelImperativeHandle,
} from "@console/ui/resizable";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import {
  WORKSPACE_LAYOUT_COOKIE,
  type WorkspaceLayout,
} from "@/lib/workspace-layout";

const MAIN = "workspace-main";
const AGENT = "workspace-agent";
const AGENT_DEFAULT_SIZE = "28";

interface WorkspaceState {
  agentRef: React.RefObject<PanelImperativeHandle | null>;
  agentOpen: boolean;
  onAgentResize: (open: boolean) => void;
  toggleAgent: () => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * Owns the agent column's open state so the header toggle and the panes
 * share it. `]` toggles the column, mirroring `[` for the sidebar.
 */
export function WorkspaceProvider({
  initialLayout,
  children,
}: {
  initialLayout?: WorkspaceLayout;
  children: React.ReactNode;
}) {
  const agentRef = usePanelRef();
  const [agentOpen, setAgentOpen] = useState((initialLayout?.[AGENT] ?? 1) > 0);
  const [hasOpenSize, setHasOpenSize] = useState(agentOpen);

  // A column saved collapsed has no open size to return to this session, so
  // it reopens at the default width instead of the minimum.
  const toggleAgent = useCallback(() => {
    const panel = agentRef.current;
    if (!panel) return;
    if (!panel.isCollapsed()) panel.collapse();
    else if (hasOpenSize) panel.expand();
    else panel.resize(AGENT_DEFAULT_SIZE);
  }, [agentRef, hasOpenSize]);

  const onAgentResize = useCallback((open: boolean) => {
    setAgentOpen(open);
    if (open) setHasOpenSize(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "]" && !isEditable(event.target)) toggleAgent();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleAgent]);

  return (
    <WorkspaceContext.Provider value={{ agentRef, agentOpen, onAgentResize, toggleAgent }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Main content and the agent column, split by a draggable seam. Dragging the
 * column past its minimum collapses it; dragging the seam back out reopens it.
 * Below `lg` the column lives in a header sheet, so only `main` shows.
 */
export function WorkspacePanes({
  initialLayout,
  agent,
  children,
}: {
  initialLayout?: WorkspaceLayout;
  agent: React.ReactNode;
  children: React.ReactNode;
}) {
  const { agentRef, onAgentResize } = useWorkspace();

  return (
    <ResizablePanelGroup
      id="workspace"
      className="min-h-0 flex-1"
      defaultLayout={initialLayout}
      onLayoutChanged={(layout) => {
        document.cookie = `${WORKSPACE_LAYOUT_COOKIE}=${encodeURIComponent(
          JSON.stringify(layout),
        )}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      <ResizablePanel id={MAIN} minSize="40" style={{ overflow: "hidden" }}>
        <main className="h-full min-w-0 overflow-hidden p-3 lg:pr-0">{children}</main>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        id={AGENT}
        panelRef={agentRef}
        collapsible
        defaultSize={AGENT_DEFAULT_SIZE}
        minSize="280px"
        maxSize="50"
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => onAgentResize(size.asPercentage > 0)}
        style={{ overflow: "hidden" }}
      >
        {agent}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** Opens and closes the column pane from `lg` up; `]` does the same. */
export function AgentColumnToggle() {
  const { agentOpen, toggleAgent } = useWorkspace();
  return (
    <button
      type="button"
      onClick={toggleAgent}
      aria-pressed={agentOpen}
      title="Toggle Devin column (])"
      className={cn(
        "hidden h-7 items-center gap-1.5 rounded-md border border-input px-2 text-[11px] lg:flex",
        agentOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon name="PanelRight" className="size-3.5" />
      Devin
      <kbd className="font-mono text-[10px] opacity-70">]</kbd>
    </button>
  );
}
