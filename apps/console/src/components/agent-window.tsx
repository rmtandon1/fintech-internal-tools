"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@console/ui/dialog";
import { Icon } from "@console/ui/icon";
import { Panel } from "@/components/panel";
import { shouldToggleAgentWindow } from "@/lib/agent-window-shortcut";
import type { DevinMode } from "@/lib/devin-status";
import { cn } from "@console/ui/utils";

/**
 * Devin's work shows in a centred modal window rather than a column. The
 * header button or `]` toggles it; Esc, the close button, or `]` closes it.
 * The body is rendered on the server and mounts into `children`; `source`
 * names where it comes from, and simulation mode is marked on the button.
 */
export function AgentWindow({
  children,
  mode = "live",
  source = "",
}: {
  children?: React.ReactNode;
  mode?: DevinMode;
  source?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldToggleAgentWindow(event.key, target)) return;
      setOpen((o) => !o);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-pressed={open}
        title={mode === "simulation" ? "Devin (preview: not connected)" : "Devin"}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-sm",
          open ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon name="Bot" className="size-4" />
        Devin
        {mode === "simulation" ? (
          <span
            className="rounded-sm bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-300"
            data-testid="devin-simulation-chip"
          >
            Preview
          </span>
        ) : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">Devin</DialogTitle>
          <Panel
            title="Devin"
            actions={<span className="mr-6 text-[10px] text-muted-foreground">{source}</span>}
            className="h-[80vh] rounded-none border-0"
          >
            {children ?? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                <Icon name="Bot" className="size-5 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">Nothing yet</div>
              </div>
            )}
          </Panel>
        </DialogContent>
      </Dialog>
    </>
  );
}
