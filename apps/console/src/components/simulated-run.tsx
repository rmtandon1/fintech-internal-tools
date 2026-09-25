import { ChecklistList } from "@/components/checklist-list";
import type { SimulatedRun } from "@/lib/simulation";

/** The label every simulated surface carries, so nothing reads as a real run. */
export function SimulationBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300"
      data-testid="simulation-banner"
    >
      <span className="font-semibold uppercase tracking-wider">Simulation</span>
      <span className="text-amber-200/80">
        {" "}
        · DEVIN_API_KEY is not set. These lines are pre-written: this is what a finished run would
        report. No Devin session is created and nothing is written.
      </span>
      {children}
    </div>
  );
}

/** A finished run, as the run view would show it, from a pre-written script. */
export function SimulatedRunView({ run }: { run: SimulatedRun }) {
  return (
    <div className="space-y-3 text-xs" data-testid="simulated-run">
      <div>
        <div className="text-[11px] text-muted-foreground">
          <span className="font-mono">{run.kind}</span> · {run.spec}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words">{run.intent}</p>
      </div>
      <ol className="list-decimal space-y-1 pl-4 text-muted-foreground marker:text-muted-foreground/60">
        {run.sentences.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ol>
      <ChecklistList lines={run.checklist} className="border-t border-border pt-2" />
    </div>
  );
}
