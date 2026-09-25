import type { StatusDecl, StatusTone } from "@console/engine/types";
import { cn } from "./utils";
import { titleCase } from "./format";

const TONES: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  positive: "border-success/30 bg-success/10 text-success",
  negative: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
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
