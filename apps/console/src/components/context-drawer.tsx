"use client";

import { useState } from "react";
import { Icon } from "@console/ui/icon";
import { Sheet, SheetContent, SheetTitle } from "@console/ui/sheet";
import { cn } from "@console/ui/utils";

/**
 * Context from another tool, docked to the foot of the record column. The
 * sheet mounts inside the column rather than over the page, so the record
 * stays visible above it. Content is resolved on the server and passed in.
 */
export function ContextDrawer({
  title,
  summary,
  content,
  children,
}: {
  title: string;
  /** One-line aggregate shown on the strip whether the drawer is open or not. */
  summary: React.ReactNode;
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div ref={setContainer} className="relative flex min-h-0 flex-1 flex-col">
      {children}
      <Sheet open={open} onOpenChange={setOpen} modal={false}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            "flex h-10 min-w-0 shrink-0 items-center gap-2 border-t border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:text-foreground",
            open && "invisible",
          )}
        >
          <Icon name="ChevronRight" className="size-3 shrink-0" />
          <span className="truncate">{title}</span>
          <span className="ml-auto hidden shrink-0 sm:block">{summary}</span>
        </button>
        {container ? (
          <SheetContent
            side="bottom"
            container={container}
            showCloseButton={false}
            showOverlay={false}
            onInteractOutside={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="absolute inset-x-0 bottom-0 max-h-[60%] gap-0 rounded-b-md border border-border bg-card shadow-none data-[state=open]:duration-200"
          >
            <div className="flex h-10 min-w-0 shrink-0 items-center gap-2 border-b border-border px-4 text-sm font-medium text-muted-foreground">
              <Icon name="ChevronDown" className="size-3 shrink-0" />
              <SheetTitle className="truncate text-sm font-semibold text-foreground">
                {title}
              </SheetTitle>
              <span className="ml-auto hidden shrink-0 sm:block">{summary}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto shrink-0 rounded-xs opacity-70 hover:opacity-100 sm:ml-1"
                aria-label="Close"
              >
                <Icon name="X" className="size-3.5" />
              </button>
            </div>
            <div className="min-h-0 overflow-auto p-3">{content}</div>
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  );
}
