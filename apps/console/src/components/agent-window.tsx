"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@console/ui/dialog";
import { Icon } from "@console/ui/icon";
import { Panel } from "@/components/panel";
import { cn } from "@console/ui/utils";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * Devin's work shows in a centred modal window rather than a column. The
 * header button or `]` toggles it; Esc, the close button, or `]` closes it.
 * This shell only knows the "No runs" state; the handoff panel and run view
 * mount into `children`.
 */
export function AgentWindow({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "]" || isEditable(event.target)) return;
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
        title="Toggle Devin window (])"
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border border-input px-2 text-[11px]",
          open ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon name="Bot" className="size-3.5" />
        Devin
        <kbd className="font-mono text-[10px] opacity-70">]</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden">
          <DialogTitle className="sr-only">Devin</DialogTitle>
          <Panel
            title="Devin"
            actions={<span className="text-[10px] text-muted-foreground">source: none</span>}
            className="h-[70vh] border-0 rounded-none"
          >
            {children ?? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                <Icon name="Bot" className="size-5 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">No runs yet</div>
              </div>
            )}
          </Panel>
        </DialogContent>
      </Dialog>
    </>
  );
}
