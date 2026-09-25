"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { stopAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import { Icon } from "@console/ui/icon";
import { StatusChip } from "@console/ui/status-chip";
import { ApprovalDialog } from "@/components/approval-dialog";
import type { RunViewPayload } from "@/lib/devin-route";
import type { ReplayFrame, StructuredOutput } from "@console/tool-automation";

const TERMINAL = new Set(["merged", "stopped", "dispatch_failed"]);

const RUN_STATUSES = [
  { value: "dispatched", label: "Dispatched", tone: "info" as const },
  { value: "dispatch_failed", label: "Dispatch failed", tone: "negative" as const },
  { value: "running", label: "Running", tone: "info" as const },
  { value: "approved", label: "Approved", tone: "positive" as const },
  { value: "merged", label: "Merged", tone: "positive" as const },
  { value: "stopped", label: "Stopped", tone: "neutral" as const },
];

/** The business sentence for what the run changes once merged. */
function summary(run: RunViewPayload["run"]): string {
  if (run.kind === "REVERSAL") {
    return `Removing the change run ${run.reverses ?? ""} added, and keeping everything merged since.`;
  }
  if (run.spec === "REFUND_CLUSTERING_HOLD.md") {
    return "Holding a merchant's not-received refunds once together they pass the manager line, and sending those customers' KYC approvals to a manager.";
  }
  return run.intent;
}

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
}: {
  state: "done" | "active" | "waiting";
  label: string;
  detail?: string;
}) {
  const glyph = state === "done" ? "✓" : state === "active" ? "●" : "○";
  return (
    <li className="flex items-baseline gap-2 py-0.5 text-[11px]">
      <span
        className={
          state === "done"
            ? "text-emerald-400"
            : state === "active"
              ? "text-amber-400"
              : "text-muted-foreground/60"
        }
      >
        {glyph}
      </span>
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
  rows.push({
    state: stateOf("baseline"),
    label: PHASE_LABELS.baseline,
    detail:
      durations.baseline !== undefined
        ? `${out?.verify_steps.find((s) => s.name === "Test")?.before ?? 68} tests`
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
    detail: steps.find((s) => s.name === "Test")?.after
      ? `${steps.find((s) => s.name === "Test")?.before} → ${steps.find((s) => s.name === "Test")?.after}`
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
  return (
    <ul className="px-3 py-1">
      {rows.map((row, i) => (
        <CheckRow key={i} {...row} />
      ))}
    </ul>
  );
}

function Detail({ frames }: { frames: ReplayFrame[] }) {
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
                {new Date(f.at_ms).toISOString().slice(11, 19)}
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
export function RunView({ runId, initial }: { runId: string; initial?: RunViewPayload | null }) {
  const [payload, setPayload] = useState<RunViewPayload | null>(initial ?? null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [stopOpen, setStopOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/devin/${runId}`).catch(() => null);
      if (!res || cancelled) return;
      if (!res.ok) return;
      const body = (await res.json()) as RunViewPayload;
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

  if (!payload) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading run…</p>;
  }
  const { run, latest, frames, offers, sessionUrl, mode } = payload;
  const out = latest?.structured_output ?? null;
  const pr = run.prUrl ?? out?.pr_url ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col text-xs" data-testid="run-view">
      <section className="border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[11px]">{run.kind}</span>
          <StatusChip value={run.status} statuses={RUN_STATUSES} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {mode === "live" ? "Live · session" : "Replay · replay.json"}
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
          requested by <span className="text-foreground">{run.requestedByRole}</span> ·{" "}
          {summary(run)}
        </p>
        {run.reverses ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            reverses <span className="font-mono text-foreground">{run.reverses}</span>
          </p>
        ) : null}
      </section>

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
                placeholder="Reason"
                className="h-6 w-32 rounded-md border border-input bg-transparent px-1.5 text-[11px]"
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
        <Detail frames={frames} />
      </div>

      <ApprovalDialog runId={runId} payload={payload} open={approveOpen} onOpenChange={setApproveOpen} />
    </div>
  );
}
