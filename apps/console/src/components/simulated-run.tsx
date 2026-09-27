import { RunReplay } from "@/components/run-replay";
import { RunReport } from "@/components/run-report";
import type { SimulatedRun } from "@/lib/simulation";

/** The label every simulated surface carries, so nothing reads as a real run. */
export function SimulationBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning"
      data-testid="simulation-banner"
    >
      <span className="font-semibold">Preview.</span> Devin isn&apos;t connected here, so this
      shows what a finished request looks like. Nothing is sent or changed.
      {children}
    </div>
  );
}

/**
 * A finished run from a pre-written script, played back as it would have
 * unfolded, then laid out as the run view would show it. With `autoPlay` off
 * it opens on the finished run.
 */
export function SimulatedRunView({ run, autoPlay = true }: { run: SimulatedRun; autoPlay?: boolean }) {
  return (
    <div className="space-y-6 text-sm" data-testid="simulated-run">
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground">{run.kindLabel}</div>
        <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {run.intent}
        </p>
      </div>
      <RunReplay run={run} autoPlay={autoPlay}>
        <RunReport output={run.output} />
      </RunReplay>
    </div>
  );
}
