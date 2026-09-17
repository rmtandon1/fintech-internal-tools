import type { StatusDecl, StatusTone } from "@/engine/types";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

const TONES: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  negative: "border-red-500/30 bg-red-500/10 text-red-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-400",
};

export function StatusChip({
  value,
  statuses,
  className,
}: {
  value: string;
  statuses?: StatusDecl[];
  className?: string;
}) {
  const decl = statuses?.find((s) => s.value === value);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONES[decl?.tone ?? "neutral"],
        className,
      )}
    >
      {decl?.label ?? titleCase(value)}
    </span>
  );
}
