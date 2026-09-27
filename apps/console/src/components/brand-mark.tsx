import { cn } from "@console/ui/utils";
import { BRAND } from "@/lib/brand";

/**
 * The name set like a terminal prompt: lowercase monospace with a block
 * cursor. Plain ink, no gradient, so it reads as a serious tool.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-mono font-semibold tracking-tight text-foreground",
        className,
      )}
    >
      {BRAND.name.toLowerCase()}
      <span
        aria-hidden
        className="ml-[0.08em] inline-block h-[0.8em] w-[0.5em] translate-y-[0.08em] bg-success motion-safe:animate-caret"
      />
    </span>
  );
}
