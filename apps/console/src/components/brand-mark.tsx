import { cn } from "@console/ui/utils";
import { BRAND } from "@/lib/brand";

/** The name set in lowercase monospace, in plain ink: a quiet nod to the terminal. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-mono font-semibold tracking-tight text-foreground", className)}>
      {BRAND.name.toLowerCase()}
    </span>
  );
}
