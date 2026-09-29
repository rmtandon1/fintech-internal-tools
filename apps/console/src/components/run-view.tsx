"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { stopAutomationRun, syncAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import { StatusChip } from "@console/ui/status-chip";
import { ApprovalDialog } from "@/components/approval-dialog";
import { RunSummary, RUN_STATUS_OPTIONS, requesterLabel } from "@/components/run-summary";
import { phaseLine } from "@/lib/run-checklist";
import { runTitle, thinkingLine } from "@/lib/run-heading";
import type { RunViewPayload } from "@/lib/devin-route";
import type { ReplayFrame, StructuredOutput } from "@console/tool-automation";

/** Offered as the stop reason; Tab fills it in. */
const STOP_SUGGESTION = "No longer needed.";

const TERMINAL = new Set(["merged", "stopped", "dispatch_failed"]);

async function fetchRun(runId: string): Promise<RunViewPayload | null> {
  const res = await fetch(`/api/devin/${runId}`).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as RunViewPayload;
}

const RUN_STATUSES = RUN_STATUS_OPTIONS;

const PHASE_ORDER = ["intake", "baseline", "plan", "edit", "verify", "pull_request", "approved", "merged"] as const;

const PHASE_LABELS: Record<(typeof PHASE_ORDER)[number], string> = {
  intake: "Read the evidence",
  baseline: "Confirmed the base",
  plan: "Planned",
  edit: "Made the change",
  verify: "Verified",
  pull_request: "PR open",
  approved: "Approved by an engineer",
  merged: "Merged",
};

type CheckLine = { state: "done" | "active" | "waiting" | "failed"; label: string; detail?: string };
type CheckPhase = CheckLine & { children?: CheckLine[] };

function CheckRow({
  state,
  label,
  detail,
  children,
  nested = false,
  still = false,
}: CheckPhase & {
  nested?: boolean;
  /** Devin isn't working on the active step (the run ended, or it waits for a reply): no spinner. */
  still?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 py-1.5 text-sm",
        nested && "gap-x-2 py-0.5 text-[10px] text-muted-foreground",
        state === "active" && "font-medium text-info",
        state === "failed" && "text-destructive",
        state === "waiting" && "text-muted-foreground",
      )}
      data-state={state}
    >
      {state === "done" ? (
        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-white", nested && "size-3.5")}>
          <Icon name="Check" className={nested ? "size-2.5" : "size-3"} strokeWidth={3} aria-label="Done" />
        </span>
      ) : state === "failed" ? (
        <span className={cn("flex size-5 shrink-0 items-center justify-center", nested && "size-3.5")}>
          <Icon name="CircleX" className={nested ? "size-3.5" : "size-5"} aria-label="Failed" />
        </span>
      ) : state === "active" && still ? (
        <span className={cn("flex size-5 shrink-0 items-center justify-center", nested && "size-3.5")}>
          <span className={cn("size-2.5 rounded-full bg-warning", nested && "size-2")} aria-label="Paused" />
        </span>
      ) : state === "active" ? (
        <span
          role="status"
          aria-label="In progress"
          className={cn("inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-info border-t-transparent", nested && "size-3.5")}
        />
      ) : (
        <span className={cn("flex size-5 shrink-0 items-center justify-center", nested && "size-3.5")}>
          <span className={cn("size-2.5 rounded-full border border-muted-foreground/40", nested && "size-2")} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className={cn("shrink-0 font-mono text-xs text-muted-foreground tabular-nums", nested && "max-w-[50%] truncate text-[10px]")} title={nested ? detail : undefined}>{detail}</span>
      ) : null}
      {children && children.length > 0 ? (
        <ul className="ml-2 mt-1 w-full border-l border-border/60 pl-3">
          {children.map((child, i) => (
            <CheckRow key={i} {...child} nested still={still} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Checklist({ out, run }: { out: StructuredOutput | null; run: RunViewPayload["run"] }) {
  const durations = out?.phase_durations_s ?? {};
  const current = out?.phase ?? null;
  // A running session that has not reported a phase yet is reading the evidence.
  const reached = current ? PHASE_ORDER.indexOf(current === "merge" ? "merged" : current) : run.status === "running" ? 0 : -1;
  const stateOf = (phase: (typeof PHASE_ORDER)[number]): CheckLine["state"] => {
    if (phase === "approved") return run.approvedBy ? "done" : run.status === "approved" ? "active" : "waiting";
    if (phase === "merged") return run.status === "merged" ? "done" : "waiting";
    if (phase === "pull_request" && (run.prUrl || out?.pr_url)) return "done";
    const i = PHASE_ORDER.indexOf(phase);
    if (run.status === "merged" || i < reached) return "done";
    if (i === reached) return out?.phase_status === "done" ? "done" : "active";
    return "waiting";
  };

  const testStep = out?.verify_steps.find((s) => s.name === "Test");
  const pr = run.prUrl ?? out?.pr_url ?? null;
  const prNumber = pr?.match(/pull\/(\d+)/)?.[1];
  const rows: CheckPhase[] = PHASE_ORDER.map((phase) => {
    const row: CheckPhase = { state: stateOf(phase), label: PHASE_LABELS[phase] };
    switch (phase) {
      case "intake":
        row.detail = out?.base_commit ? `base ${out.base_commit.slice(0, 7)}` : undefined;
        break;
      case "baseline":
        row.detail = durations.baseline !== undefined && testStep?.before != null
          ? `${testStep.before} tests` : undefined;
        break;
      case "plan":
        row.detail = durations.plan !== undefined ? `${durations.plan}s` : undefined;
        row.children = out?.reuses.map((reuse) => ({
          state: "done", label: `Reused ${reuse.module.split("/").pop()}`, detail: reuse.reason,
        }));
        break;
      case "edit": {
        const editDone = stateOf("edit") === "done";
        row.detail = out && out.files.length > 0 && reached >= PHASE_ORDER.indexOf("edit")
          ? `+${out.files.reduce((n, f) => n + f.additions, 0)} −${out.files.reduce((n, f) => n + f.deletions, 0)}`
          : undefined;
        row.children = out?.files.map((file) => ({
          state: editDone ? "done" : "waiting",
          label: `${file.op === "create" ? "Adding" : file.op === "delete" ? "Removing" : "Editing"} ${file.path}`,
          detail: `+${file.additions} −${file.deletions}`,
        }));
        break;
      }
      case "verify": {
        const activeStep = out?.verify_steps.findIndex((step) => step.pass === null);
        row.detail = testStep?.after != null ? `${testStep.before ?? "?"} → ${testStep.after}` : undefined;
        row.children = out?.verify_steps.map((step, i) => ({
          state: step.pass === false ? "failed" : step.pass === true ? "done"
            : stateOf("verify") === "active" && i === activeStep ? "active" : "waiting",
          label: `${step.name} ${step.pass === true ? "✓" : step.pass === false ? "✗" : "…"}`,
        }));
        break;
      }
      case "pull_request":
        row.detail = prNumber ? `#${prNumber}` : undefined;
        break;
      case "approved":
        row.detail = run.approvedBy ?? undefined;
        break;
      case "merged":
        row.detail = run.mergeCommit?.slice(0, 7);
    }
    return row;
  });
  const still =
    TERMINAL.has(run.status) ||
    out?.phase_status === "waiting_for_user" ||
    out?.phase_status === "stopped";
  return (
    <ul className="px-5 py-3">
      {rows.map((row, i) => (
        <CheckRow key={PHASE_ORDER[i]} {...row} still={still} />
      ))}
    </ul>
  );
}

/** Elapsed time since dispatch, `+mm:ss` — frames are relative, not clocked. */
function elapsed(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Detail({ frames }: { frames: ReplayFrame[] }) {
  // Scripted frames are offsets from 0; live-poll frames are epoch stamps.
  // Either way the first frame is t=0.
  const t0 = frames[0]?.at_ms ?? 0;
  const latest = frames.at(-1)?.structured_output ?? null;
  if (!latest) return null;
  return (
    <details className="px-5 py-3 text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
        Engineering detail
      </summary>
      {latest.files.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {latest.files.map((f) => (
            <li key={f.path} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
              <span className="shrink-0 font-mono text-muted-foreground">{f.op}</span>
              <span className="shrink-0 tabular-nums">
                <span className="text-emerald-400">+{f.additions}</span>{" "}
                <span className="text-red-400">−{f.deletions}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {latest.conflicts.map((c) => (
        <p key={c.file} className="mt-1 text-muted-foreground">
          conflict in <span className="font-mono">{c.file}</span>: kept {c.kept}, removed {c.removed}
        </p>
      ))}
      <ol className="mt-2 divide-y divide-border/50 border-t border-border/50">
        {frames
          .slice()
          .reverse()
          .map((f) => (
            <li key={f.at_ms} className="flex items-baseline gap-2 py-0.5">
              <span className="font-mono text-muted-foreground tabular-nums">
                {elapsed(f.at_ms - t0)}
              </span>
              <span className="font-mono">{f.structured_output.phase}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {f.status_detail ?? f.status}
              </span>
            </li>
          ))}
      </ol>
    </details>
  );
}

/**
 * The run's evidence while it is in flight and after it merges: polls
 * `/api/devin/<id>` every 2s and stops when the run ends. Shared by the
 * agent column and `/t/automation/<id>`.
 */
export function RunView({
  runId,
  initial,
  showSummary = false,
  onTitle,
}: {
  runId: string;
  initial?: RunViewPayload | null;
  /** Render the run summary card above the live view (the record page wants it). */
  showSummary?: boolean;
  /** Receives the run's title once its payload arrives (the Devin window shows it). */
  onTitle?: (title: string) => void;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<RunViewPayload | null>(initial ?? null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [stopOpen, setStopOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const body = await fetchRun(runId);
      if (!body || cancelled) return;
      setPayload(body);
      return !TERMINAL.has(body.run.status);
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function loop() {
      const more = await poll();
      if (!cancelled && more !== false) timer = setTimeout(loop, 2000);
    }
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  const title = payload && payload.run.id === runId ? runTitle(payload) : null;
  useEffect(() => {
    if (title) onTitle?.(title);
  }, [title, onTitle]);

  function sendReply() {
    startTransition(async () => {
      const res = await fetch(`/api/devin/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        toast.success("Reply sent");
        setReply("");
      } else {
        toast.error("Reply failed", { description: `HTTP ${res.status}` });
      }
    });
  }

  function stop(reason: string) {
    startTransition(async () => {
      const result = await stopAutomationRun(runId, reason);
      if (result.ok) toast.success(result.title, { description: result.detail });
      else toast.error(result.title, { description: result.detail });
      setStopOpen(false);
    });
  }

  function pullMerged() {
    startTransition(async () => {
      const result = await syncAutomationRun(runId);
      if (result.ok) toast.success(result.title, { description: result.detail });
      else toast.error(result.title, { description: result.detail });
      if (result.reload) {
        router.refresh();
        const body = await fetchRun(runId);
        if (body) setPayload(body);
      }
    });
  }

  // A payload fetched for another runId (stale after a focus change) is no
  // better than none: keep showing the loading state until ours arrives.
  if (!payload || payload.run.id !== runId) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading run…</p>;
  }
  const { run, latest, frames, offers, sessionUrl, mode } = payload;
  const out = latest?.structured_output ?? null;
  const pr = run.prUrl ?? out?.pr_url ?? null;
  const thinking = thinkingLine(latest, payload.devinMessage);

  const ended = TERMINAL.has(run.status);
  const linkButton =
    "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors";

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm" data-testid="run-view">
      {showSummary ? (
        <RunSummary
          run={run}
          output={out}
          phaseLine={phaseLine(out)}
          outcome={payload.outcome}
          operationLabel={payload.operationLabel}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <section className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 pt-4 text-xs text-muted-foreground">
          <span>{payload.operationLabel}</span>
          <StatusChip value={run.status} statuses={RUN_STATUSES} />
          <span>{mode === "live" ? "Live session" : "Recorded replay"}</span>
          <span>· requested by {requesterLabel(run)}</span>
          {run.reverses ? (
            <span>
              · reverses <span className="font-mono text-foreground">{run.reverses}</span>
            </span>
          ) : null}
        </section>

        {thinking ? (
          <section
            className="mx-5 mt-3 rounded-lg border border-info/30 bg-info/10 px-4 py-3"
            data-testid="devin-thinking"
          >
            <p className="text-xs font-semibold text-info">
              {ended ? "Devin\u2019s last update:" : "Devin\u2019s current thinking:"}
            </p>
            <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm leading-snug text-foreground">
              {thinking}
            </p>
          </section>
        ) : null}

        <Checklist out={out} run={run} />

        {payload.prompt ? (
          <section className="px-5 pb-3" data-testid="devin-message">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Message sent to Devin</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 px-4 py-3 font-sans text-xs leading-relaxed text-foreground">
              {payload.prompt}
            </pre>
          </section>
        ) : null}
        <Detail frames={frames} />
      </div>

      {offers.reply ? (
        <form
          className="flex items-center gap-2 border-t border-border px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) sendReply();
          }}
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to Devin…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm"
          />
          <Button size="sm" className="h-9" disabled={pending || !reply.trim()}>
            Send
          </Button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        {sessionUrl ? (
          <a
            href={sessionUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(linkButton, "bg-info/10 text-info hover:bg-info/20")}
          >
            <Icon name="ExternalLink" className="size-4" />
            View in Devin session
          </a>
        ) : null}
        {pr ? (
          <a
            href={pr}
            target="_blank"
            rel="noreferrer"
            className={cn(linkButton, "border border-border text-foreground hover:bg-muted")}
          >
            <Icon name="GitPullRequest" className="size-4" />
            PR #{pr.match(/pull\/(\d+)/)?.[1] ?? ""}
          </a>
        ) : null}
        {offers.sync ? (
          <Button className="h-10 flex-1" disabled={pending} onClick={pullMerged}>
            Pull merged code
          </Button>
        ) : null}
        {offers.approve.offered ? (
          <Button className="h-10 flex-1" onClick={() => setApproveOpen(true)} data-testid="approve-run">
            Review and approve
          </Button>
        ) : null}
        {offers.stop.offered ? (
          stopOpen ? (
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                stop(new FormData(e.currentTarget).get("reason")?.toString() || "stopped by operator");
              }}
            >
              <input
                name="reason"
                required
                autoFocus
                placeholder={STOP_SUGGESTION}
                title="Tab fills in the suggested reason"
                onKeyDown={(e) => {
                  const box = e.currentTarget;
                  if (e.key === "Tab" && !e.shiftKey && STOP_SUGGESTION.toLowerCase().startsWith(box.value.toLowerCase()) && box.value !== STOP_SUGGESTION) {
                    e.preventDefault();
                    box.value = STOP_SUGGESTION;
                  }
                }}
                className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm"
              />
              <Button variant="destructive" className="h-10" disabled={pending}>
                Stop
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className={cn(linkButton, "bg-destructive/10 text-destructive hover:bg-destructive/20")}
              onClick={() => setStopOpen(true)}
            >
              <Icon name="CircleStop" className="size-4" />
              Stop run
            </button>
          )
        ) : null}
      </div>

      <ApprovalDialog runId={runId} payload={payload} open={approveOpen} onOpenChange={setApproveOpen} />
    </div>
  );
}
