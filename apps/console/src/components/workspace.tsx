"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { AgentFocus } from "@/lib/handoff";

interface WorkspaceState {
  /** The Devin window (modal) is open. */
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
  toggleAgent: () => void;
  /** What the window is showing: a handoff being composed, or a run. */
  agentFocus: AgentFocus;
  /** Focusing also opens the window when it is closed. */
  setAgentFocus: (focus: AgentFocus) => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

/**
 * Owns the Devin window's open state so the header button, the `]` shortcut
 * and every "Ask Devin" trigger share it. `]` toggling itself lives in
 * AgentWindow (via `shouldToggleAgentWindow`).
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentFocus, setFocus] = useState<AgentFocus>(null);

  const toggleAgent = useCallback(() => setAgentOpen((o) => !o), []);

  const setAgentFocus = useCallback((focus: AgentFocus) => {
    setFocus(focus);
    if (focus !== null) setAgentOpen(true);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{ agentOpen, setAgentOpen, toggleAgent, agentFocus, setAgentFocus }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
