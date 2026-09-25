import { CHECKLIST_GLYPH } from "@/lib/checklist-glyph";
import type { ChecklistLine } from "@/lib/run-checklist";
import { cn } from "@console/ui/utils";

/**
 * A run checklist, one glyph line per entry. Presentational only, so the run
 * view (server) and the simulation in the dispatch dialog (client) share it.
 */
export function ChecklistList({ lines, className }: { lines: ChecklistLine[]; className?: string }) {
  return (
    <ol className={cn("space-y-1", className)} data-testid="run-checklist">
      {lines.map((line, i) => (
        <li key={`${line.field}:${i}`} className="flex items-baseline gap-2">
          <span
            aria-label={line.state}
            className={cn(
              "w-3 shrink-0 text-center font-mono",
              line.state === "done" && "text-emerald-400",
              line.state === "running" && "text-amber-400",
              line.state === "waiting" && "text-muted-foreground",
              line.state === "failed" && "text-red-400",
            )}
          >
            {CHECKLIST_GLYPH[line.state]}
          </span>
          <span className={cn(line.state === "waiting" && "text-muted-foreground")}>{line.label}</span>
          {line.detail ? (
            <span className="min-w-0 truncate font-mono text-muted-foreground">{line.detail}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
