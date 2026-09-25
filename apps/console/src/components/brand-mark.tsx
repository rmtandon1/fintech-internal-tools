import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import { BRAND } from "@/lib/brand";

/** The columned mark: Solon's laws hung in the Royal Stoa for anyone to read. */
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25",
        size === "lg" ? "size-14 rounded-2xl" : "size-7 rounded-lg",
      )}
    >
      <Icon name="Landmark" className={size === "lg" ? "size-7" : "size-4"} strokeWidth={2.25} />
    </span>
  );
}

/** The name in the brand gradient. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r from-indigo-200 via-violet-300 to-fuchsia-300 bg-clip-text font-semibold tracking-tight text-transparent",
        className,
      )}
    >
      {BRAND.name}
    </span>
  );
}
