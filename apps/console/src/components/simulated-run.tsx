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

/** A finished run, as the run view would show it, from a pre-written script. */
export function SimulatedRunView({ run }: { run: SimulatedRun }) {
  return (
    <div className="space-y-6 text-sm" data-testid="simulated-run">
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground">{run.kindLabel}</div>
        <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {run.intent}
        </p>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">What Devin did</h3>
        <ol className="space-y-2.5">
          {run.sentences.map((sentence, index) => (
            <li key={sentence} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-xs font-semibold text-success">
                {index + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{sentence}</span>
            </li>
          ))}
        </ol>
      </section>
      <RunReport output={run.output} />
    </div>
  );
}
