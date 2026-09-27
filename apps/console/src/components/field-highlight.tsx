"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@console/ui/tooltip";
import { cn } from "@console/ui/utils";

export type HighlightTone = "approval" | "block";

/**
 * Marks a field a rule is holding or blocking on: pale yellow when the action
 * needs approval, pale red when it is blocked, with the rule's reason on hover.
 */
export function FieldHighlight({
  tone,
  reasons,
  children,
}: {
  tone: HighlightTone;
  reasons: string[];
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            tabIndex={0}
            className={cn(
              "-mx-2 -my-1 min-w-0 cursor-help space-y-0.5 rounded-md px-2 py-1 ring-1 outline-none focus-visible:ring-2",
              tone === "approval"
                ? "bg-yellow-100 ring-yellow-300/70 dark:bg-yellow-400/15 dark:ring-yellow-400/30"
                : "bg-red-50 ring-red-300/70 dark:bg-red-400/15 dark:ring-red-400/30",
            )}
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-sm">
          {reasons.join(". ")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
