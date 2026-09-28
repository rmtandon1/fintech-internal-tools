"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { stopAutomationRun, syncAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import { Icon } from "@console/ui/icon";
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

const PHASE_LABELS: Record<string, string> = {
  intake: "Read the evidence",
  baseline: "Confirmed the base",
  plan: "Planned",
  edit: "Made the change",
  verify: "Verified",
  pull_request: "PR open",
  merge: "Merged",
};

function CheckRow({
  state,
  label,
  detail,
  still = false,
}: {
  state: "done" | "active" | "waiting";
  label: string;
  detail?: string;
  /** Devin isn't working on the active step (the run ended, or it waits for a reply): no spinner. */
  still?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 py-0.5 text-[11px]" data-state={state}>
      {state === "active" && still ? (
        <span className="w-2.5 shrink-0 text-amber-400">●</span>
      ) : state === "active" ? (
        <span
          role="status"
          aria-label="In progress"
          className="inline-block size-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-amber-400 border-t-transparent"
        />
      ) : (
        <span
          className={
            state === "done" ? "w-2.5 shrink-0 text-emerald-400" : "w-2.5 shrink-0 text-muted-foreground/60"
          }
        >
          {state === "done" ? "✓" : "○"}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
          {detail}
        </span>
      ) : null}
    </li>
  );
}

const PHASE_ORDER = ["intake", "baseline", "plan", "edit", "verify", "pull_request", "merge"];

function Checklist({ out, run }: { out: StructuredOutput | null; run: RunViewPayload["run"] }) {
  const rows: { state: "done" | "active" | "waiting"; label: string; detail?: string }[] = [];
  const durations = out?.phase_durations_s ?? {};
  const current = out?.phase ?? null;
  const reached = current ? PHASE_ORDER.indexOf(current) : -1;
  const stateOf = (phase: string): "done" | "active" | "waiting" => {
    const i = PHASE_ORDER.indexOf(phase);
    if (run.status === "merged" || i < reached) return "done";
    if (i === reached) return out?.phase_status === "done" ? "done" : "active";
    return "waiting";
  };

  rows.push({
    state: stateOf("intake"),
    label: PHASE_LABELS.intake,
    detail: out?.base_commit ? `base ${out.base_commit.slice(0, 7)}` : undefined,
  });
  const testStep = out?.verify_steps.find((s) => s.name === "Test");
  rows.push({
    state: stateOf("baseline"),
    label: PHASE_LABELS.baseline,
    detail:
      durations.baseline !== undefined && testStep?.before != null
        ? `${testStep.before} tests`
        : undefined,
  });
  rows.push({
    state: stateOf("plan"),
    label: `${PHASE_LABELS.plan} ${out && out.files.length > 0 ? `${out.files.length} files` : "files"}`,
    detail: durations.plan !== undefined ? `${durations.plan}s` : undefined,
  });
  for (const reuse of out?.reuses ?? []) {
    rows.push({ state: "done", label: `Reusing ${reuse.module.split("/").pop()}`, detail: reuse.module });
  }
  const editing = out && current === "edit" ? out.files[out.files.length - 1] : null;
  rows.push({
    state: stateOf("edit"),
    label: editing ? `Editing ${editing.path}` : PHASE_LABELS.edit,
    detail:
      out && out.files.length > 0 && reached >= PHASE_ORDER.indexOf("edit")
        ? `+${out.files.reduce((n, f) => n + f.additions, 0)} −${out.files.reduce((n, f) => n + f.deletions, 0)}`
        : undefined,
  });
  const steps = out?.verify_steps ?? [];
  rows.push({
    state: stateOf("verify"),
    label:
      steps.length > 0
        ? `${PHASE_LABELS.verify}: ${steps
            .map((s) => `${s.name} ${s.pass === true ? "✓" : s.pass === false ? "✗" : "…"}`)
            .join(" ")}`
        : PHASE_LABELS.verify,
    detail: testStep?.after
      ? `${testStep.before} → ${testStep.after}`
      : undefined,
  });
  const pr = run.prUrl ?? out?.pr_url ?? null;
  rows.push({
    state: run.prUrl || out?.pr_url ? "done" : stateOf("pull_request"),
    label: `PR open${pr ? ` #${pr.match(/pull\/(\d+)/)?.[1] ?? ""}` : ""}`,
  });
  rows.push({
    state: run.approvedBy ? "done" : run.status === "approved" ? "active" : "waiting",
    label: run.approvedBy ? `Approved by ${run.approvedBy}` : "Approved by an engineer",
  });
  rows.push({
    state: run.status === "merged" ? "done" : "waiting",
    label: "Merged",
    detail: run.mergeCommit?.slice(0, 7),
  });
  const still =
    TERMINAL.has(run.status) ||
    out?.phase_status === "waiting_for_user" ||
    out?.phase_status === "stopped";
  return (
    <ul className="px-3 py-1">
      {rows.map((row, i) => (
        <CheckRow key={i} {...row} still={still} />
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
    <section className="border-t border-border px-3 py-2 text-[11px]">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Engineering detail
      </p>
      {latest.files.length > 0 ? (
        <ul className="space-y-0.5">
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
    </section>
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
  const thinking = thinkingLine(latest);

  return (
    <div className="flex min-h-0 flex-1 flex-col text-xs" data-testid="run-view">
      {showSummary ? (
        <RunSummary
          run={run}
          output={out}
          phaseLine={phaseLine(out)}
          outcome={payload.outcome}
          operationLabel={payload.operationLabel}
        />
      ) : null}
      <section className="border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px]">{payload.operationLabel}</span>
          <StatusChip value={run.status} statuses={RUN_STATUSES} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {mode === "live" ? "Live · session" : "Recorded · replay.json"}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {sessionUrl ? (
              <a
                href={sessionUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-6 items-center gap-1 rounded-md border border-input px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Icon name="ExternalLink" className="size-3" />
                Open in Devin
              </a>
            ) : null}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground">{run.intent}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          requested by <span className="text-foreground">{requesterLabel(run)}</span> ·{" "}
          {payload.summary}
        </p>
        {run.reverses ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            reverses <span className="font-mono text-foreground">{run.reverses}</span>
          </p>
        ) : null}
      </section>

      {thinking ? (
        <section
          className="border-b border-info/20 bg-info/5 px-3 py-2.5"
          data-testid="devin-thinking"
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-info">
            {TERMINAL.has(run.status) ? "Devin\u2019s last update" : "Devin\u2019s current thinking"}
          </p>
          <p className="mt-0.5 text-sm text-foreground">{thinking}</p>
        </section>
      ) : null}

      <Checklist out={out} run={run} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        {pr ? (
          <a
            href={pr}
            target="_blank"
            rel="noreferrer"
            className="flex h-6 items-center gap-1 rounded-md border border-input px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Icon name="GitPullRequest" className="size-3" />
            PR #{pr.match(/pull\/(\d+)/)?.[1] ?? ""}
          </a>
        ) : null}
        {offers.sync ? (
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={pending}
            onClick={pullMerged}
          >
            Pull merged code
          </Button>
        ) : null}
        {offers.approve.offered ? (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => setApproveOpen(true)}
            data-testid="approve-run"
          >
            Review and approve
          </Button>
        ) : null}
        {offers.stop.offered ? (
          stopOpen ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                stop(new FormData(e.currentTarget).get("reason")?.toString() || "stopped by operator");
              }}
            >
              <input
                name="reason"
                required
                placeholder={STOP_SUGGESTION}
                title="Tab fills in the suggested reason"
                onKeyDown={(e) => {
                  const box = e.currentTarget;
                  if (e.key === "Tab" && !e.shiftKey && STOP_SUGGESTION.toLowerCase().startsWith(box.value.toLowerCase()) && box.value !== STOP_SUGGESTION) {
                    e.preventDefault();
                    box.value = STOP_SUGGESTION;
                  }
                }}
                className="h-6 w-40 rounded-md border border-input bg-transparent px-1.5 text-[11px]"
              />
              <Button size="sm" variant="destructive" className="h-6 text-[11px]" disabled={pending}>
                Stop
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => setStopOpen(true)}
            >
              Stop run
            </Button>
          )
        ) : null}
      </div>

      {offers.reply ? (
        <form
          className="flex items-center gap-2 border-t border-border px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) sendReply();
          }}
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to Devin…"
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
          />
          <Button size="sm" className="h-7 text-xs" disabled={pending || !reply.trim()}>
            Send
          </Button>
        </form>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {payload.prompt ? (
          <section className="border-t border-border px-3 py-2" data-testid="devin-message">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Message sent to Devin
            </p>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] text-foreground">
              {payload.prompt}
            </pre>
          </section>
        ) : null}
        <Detail frames={frames} />
      </div>

      <ApprovalDialog runId={runId} payload={payload} open={approveOpen} onOpenChange={setApproveOpen} />
    </div>
  );
}
