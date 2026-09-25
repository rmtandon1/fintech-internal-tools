import { ChecklistList } from "@/components/checklist-list";
import type { SimulatedRun } from "@/lib/simulation";

/** The label every simulated surface carries, so nothing reads as a real run. */
export function SimulationBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
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
    <div className="space-y-4 text-sm" data-testid="simulated-run">
      <div>
        <div className="text-xs font-medium text-muted-foreground">{run.kindLabel}</div>
        <p className="mt-1 whitespace-pre-wrap break-words">{run.intent}</p>
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground">What Devin did</div>
        <ol className="space-y-2">
          {run.sentences.map((sentence, index) => (
            <li key={sentence} className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-400">
                {index + 1}
              </span>
              <span className="leading-relaxed">{sentence}</span>
            </li>
          ))}
        </ol>
      </div>
      <details className="rounded-md border border-border">
        <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          Technical details for the reviewing engineer
        </summary>
        <ChecklistList lines={run.checklist} className="border-t border-border px-3 py-2 text-xs" />
      </details>
    </div>
  );
}
