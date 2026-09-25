import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import type { ChecklistState } from "@/lib/checklist-glyph";

export interface RailStep {
  key: string;
  label: string;
  state: ChecklistState;
}

/**
 * A run's phases as a row of stations. Finished ones fill in, the running
 * one pulses, and the connector after it fills with `progress`.
 */
export function PhaseRail({
  steps,
  progress = 0,
  className,
}: {
  steps: RailStep[];
  /** How far through the running step, 0..1. */
  progress?: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-start", className)} data-testid="phase-rail">
      {steps.map((step, i) => {
        const fill = step.state === "done" ? 1 : step.state === "running" ? progress : 0;
        return (
          <li key={step.key} className="relative flex flex-1 flex-col items-center gap-1.5">
            {i < steps.length - 1 ? (
              <span className="absolute top-3 left-[calc(50%+14px)] right-[calc(-50%+14px)] h-0.5 rounded-full bg-border">
                <span
                  className="block h-full rounded-full bg-success transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.round(fill * 100)}%` }}
                />
              </span>
            ) : null}
            <Station state={step.state} />
            <span
              className={cn(
                "text-[11px] font-medium whitespace-nowrap",
                step.state === "waiting" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Station({ state }: { state: ChecklistState }) {
  if (state === "done") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-success text-white motion-safe:animate-pop">
        <Icon name="Check" className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-destructive text-white motion-safe:animate-pop">
        <Icon name="X" className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="relative flex size-6 items-center justify-center rounded-full border-2 border-info bg-background">
        <span className="absolute inset-0 rounded-full border-2 border-info motion-safe:animate-ping" />
        <span className="size-2 rounded-full bg-info" />
      </span>
    );
  }
  return <span className="size-6 rounded-full border-2 border-border bg-background" />;
}
