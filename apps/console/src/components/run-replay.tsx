"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@console/ui/icon";
import { prefersReducedMotion } from "@console/ui/motion";
import { cn } from "@console/ui/utils";
import { PhaseRail } from "@/components/phase-rail";
import { PHASE_LABELS, PHASE_ORDER, PHASE_SHORT } from "@/lib/run-phases";
import { buildReplay, formatClock, replayFrame } from "@/lib/run-replay";
import type { SimulatedRun } from "@/lib/simulation";

/** However long the run took, the replay plays in about this many seconds. */
const REPLAY_SECONDS = 18;

function isPhase(value: string): value is (typeof PHASE_ORDER)[number] {
  return (PHASE_ORDER as readonly string[]).includes(value);
}

/**
 * A pre-written run played back on its own clock: the phases fill in, what
 * Devin did arrives line by line, and files, lines, tests and safety checks
 * count up as the run would have reported them. `children` (the full report)
 * appears once it finishes. With `autoPlay` off it opens finished, with a
 * button to replay it.
 */
export function RunReplay({
  run,
  autoPlay = true,
  children,
}: {
  run: SimulatedRun;
  autoPlay?: boolean;
  children?: React.ReactNode;
}) {
  const plan = useMemo(
    () => buildReplay(run.output, run.sentences, run.beats, PHASE_ORDER),
    [run],
  );
  const speed = plan.total / REPLAY_SECONDS;
  const [t, setT] = useState(autoPlay ? 0 : plan.total);
  const [playing, setPlaying] = useState(autoPlay);
  // The frame loop reads and advances the clock here; `t` mirrors it for render.
  const clock = useRef(t);
  const log = useRef<HTMLOListElement>(null);

  const jump = (to: number, play: boolean) => {
    clock.current = to;
    setT(to);
    setPlaying(play);
  };

  useEffect(() => {
    if (!playing) return;
    if (prefersReducedMotion()) {
      clock.current = plan.total;
      setT(plan.total);
      setPlaying(false);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current = Math.min(plan.total, clock.current + ((now - last) / 1000) * speed);
      last = now;
      setT(clock.current);
      if (clock.current >= plan.total) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, plan.total, speed]);

  const f = replayFrame(plan, t);

  useEffect(() => {
    const el = log.current;
    if (el && playing) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [f.lines, playing]);

  const active = plan.phases[f.active]?.phase;

  return (
    <div className="space-y-6" data-testid="run-replay">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <AgentMark done={f.done} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-foreground">
              {f.done
                ? "Ready for an engineer to review"
                : active && isPhase(active)
                  ? `${PHASE_LABELS[active]}…`
                  : "Starting…"}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">{formatClock(t)}</span> of
              Devin&apos;s time · played back at {Math.round(speed)}× speed
            </div>
          </div>
          <button
            type="button"
            onClick={() => (playing ? jump(plan.total, false) : jump(0, true))}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-input px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Icon name={playing ? "SkipForward" : "RotateCcw"} className="size-3.5" />
            {playing ? "Skip to end" : "Replay"}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 px-2 pt-3 pb-2">
          <PhaseRail
            steps={plan.phases.map((p, i) => ({
              key: p.phase,
              label: isPhase(p.phase) ? PHASE_SHORT[p.phase] : p.phase,
              state: f.states[i] ?? "waiting",
            }))}
            progress={f.progress}
          />
        </div>

        <div className="@container">
          <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
            <Tile label="Files changed">
              {f.filesDone}
              <span className="text-muted-foreground">/{plan.files.length}</span>
            </Tile>
            <Tile label="Lines">
              <span className="text-success">+{f.additions}</span>{" "}
              <span className="text-destructive">−{f.deletions}</span>
            </Tile>
            <Tile label="Tests">
              {f.testsBefore === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  {f.testsBefore}
                  {f.testsAfter !== null ? (
                    <span className="inline-flex items-baseline motion-safe:animate-pop">
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      {f.testsAfter}
                      {f.testsAfter !== f.testsBefore ? (
                        <span
                          className={cn(
                            "ml-1.5 text-xs font-medium",
                            f.testsAfter > f.testsBefore ? "text-success" : "text-muted-foreground",
                          )}
                        >
                          {f.testsAfter > f.testsBefore ? "+" : "−"}
                          {Math.abs(f.testsAfter - f.testsBefore)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </>
              )}
            </Tile>
            <Tile label="Safety checks">
              <span className={cn(f.guardsPassed === plan.guards.length && "text-success")}>
                {f.guardsPassed}
              </span>
              <span className="text-muted-foreground">/{plan.guards.length}</span>
            </Tile>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{f.done ? "What Devin did" : "What Devin is doing"}</h3>
        <ol
          ref={log}
          className={cn("space-y-2.5", playing && "max-h-72 overflow-auto")}
          data-testid="replay-log"
        >
          {plan.lines.slice(0, f.lines).map((line, i) => {
            const latest = i === f.lines - 1 && !f.done;
            return (
              <li key={line.text} className="flex gap-3 motion-safe:animate-line-in">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    latest ? "bg-info/15 text-info" : "bg-success/15 text-success",
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "pt-0.5 text-sm leading-relaxed",
                    latest ? "text-foreground" : "text-foreground/85",
                  )}
                >
                  {line.text}
                  {latest ? (
                    <span className="ml-1 inline-block h-3.5 w-[2px] translate-y-0.5 bg-info motion-safe:animate-caret" />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {f.done && children ? <div className="motion-safe:animate-line-in">{children}</div> : null}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold whitespace-nowrap tabular-nums text-foreground">
        {children}
      </div>
    </div>
  );
}

/** Devin's mark: a turning ring while the run works, a check once it lands. */
function AgentMark({ done }: { done: boolean }) {
  if (done) {
    return (
      <span className="relative flex size-10 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-success/40 motion-safe:animate-ripple" />
        <span className="relative flex size-10 items-center justify-center rounded-full bg-success text-white motion-safe:animate-pop">
          <Icon name="Check" className="size-5" strokeWidth={3} />
        </span>
      </span>
    );
  }
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#8b5cf6,#38bdf8,#34d399,#8b5cf6)] motion-safe:animate-orbit" />
      <span className="absolute inset-[3px] rounded-full bg-background" />
      <Icon name="Bot" className="relative size-5 text-foreground" />
    </span>
  );
}
