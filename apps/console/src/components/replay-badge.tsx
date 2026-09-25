import type { BridgeMode } from "@console/tool-automation";
import { cn } from "@console/ui/utils";

/**
 * Marks data that came from a replayed fixture rather than a live Devin
 * session. Renders nothing in live mode, so callers place it unconditionally
 * wherever session-reported data is shown.
 */
export function ReplayBadge({ mode, className }: { mode: BridgeMode; className?: string }) {
  if (mode !== "replay") return null;
  return (
    <span
      title="Session data is played from a recorded fixture, not a live Devin session"
      className={cn(
        "inline-flex items-center rounded border border-amber-400/50 bg-amber-400/10 px-1 text-[10px] font-medium uppercase tracking-wider text-amber-400",
        className,
      )}
    >
      Replay
    </span>
  );
}
