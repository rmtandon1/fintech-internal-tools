"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { approveAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@console/ui/dialog";
import { Label } from "@console/ui/label";
import { SuggestTextarea } from "@/components/suggest-textarea";
import type { RunViewPayload } from "@/lib/devin-route";

type Stage = "idle" | "approving" | "merging" | "merged" | "failed";

/** Renders the `code` and **bold** spans the spec's acceptance lines use. */
function renderInlineMarkdown(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function Row({
  mark,
  label,
  detail,
  state,
}: {
  mark: string;
  label: string;
  detail?: string;
  state: "waiting" | "active" | "done";
}) {
  const glyph = state === "done" ? "✓" : state === "active" ? "◌" : "○";
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className={state === "done" ? "text-emerald-400" : "text-muted-foreground"}>{glyph}</span>
      <span className="w-10 shrink-0 text-muted-foreground">{mark}</span>
      <span>{label}</span>
      {detail ? <span className="font-mono text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

/**
 * The human gate: an engineer who did not request the run approves, then
 * Devin merges. Each row is owned — GitHub's review, Devin's merge, the
 * console's audit row.
 */
export function ApprovalDialog({
  runId,
  payload,
  open,
  onOpenChange,
}: {
  runId: string;
  payload: RunViewPayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [approveAuditId, setApproveAuditId] = useState<string | null>(null);
  const [mergeAuditId, setMergeAuditId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  const latest = payload?.latest?.structured_output ?? null;
  const checks = latest?.verify_steps ?? [];
  const pr = payload?.run.prUrl ?? latest?.pr_url ?? null;
  const prNumber = pr?.match(/pull\/(\d+)/)?.[1];
  const merged = payload?.run.status === "merged";

  useEffect(() => {
    if (merged) setStage("merged");
  }, [merged]);

  function confirm() {
    setStage("approving");
    setFailure(null);
    startTransition(async () => {
      const result = await approveAutomationRun(runId, note);
      setApproveAuditId(result.auditId ?? null);
      if (!result.ok) {
        setStage("failed");
        setFailure(`${result.title}: ${result.detail ?? ""}`);
        return;
      }
      toast.success(result.title, { description: result.detail });
      setStage("merging");
    });
  }

  // After approval, poll the run route until the merge is recorded.
  useEffect(() => {
    if (stage !== "merging") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/devin/${runId}`).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as RunViewPayload;
      if (body.run.status === "merged") {
        setMergeAuditId(body.lastAuditId);
        setStage("merged");
        clearInterval(timer);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [stage, runId]);

  const auditLabel =
    stage === "merged"
      ? `Audit row ${mergeAuditId ?? payload?.lastAuditId ?? "…"}`
      : approveAuditId
        ? `Audit row ${approveAuditId}`
        : "Audit row";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Approve PR {prNumber ? `#${prNumber}` : ""} · {payload?.run.spec}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            Requested by <span className="text-foreground">{payload?.run.requestedByRole}</span> ·
            “{payload?.run.intent}”
          </p>
          {latest ? (
            <p className="tabular-nums">
              {latest.files.length} files ·{" "}
              <span className="text-emerald-400">
                +{latest.files.reduce((n, f) => n + f.additions, 0)}
              </span>{" "}
              <span className="text-red-400">
                −{latest.files.reduce((n, f) => n + f.deletions, 0)}
              </span>{" "}
              {pr ? (
                <a href={pr} target="_blank" rel="noreferrer" className="ml-2 hover:underline">
                  View diff on GitHub
                </a>
              ) : null}
            </p>
          ) : null}
          <p>
            Checks{" "}
            {checks.length === 0 ? (
              <span className="text-muted-foreground">not reported yet</span>
            ) : (
              checks.map((step) => (
                <span key={step.name} className="mr-2">
                  {step.name}{" "}
                  {step.pass === true ? (
                    <span className="text-emerald-400">✓</span>
                  ) : step.pass === false ? (
                    <span className="text-red-400">✗</span>
                  ) : (
                    <span className="text-muted-foreground">…</span>
                  )}
                </span>
              ))
            )}
          </p>
          <p className="text-muted-foreground">
            Context untouched{" "}
            {stage === "approving" || stage === "merging" || stage === "merged" ? "✓" : "…"} · the
            server compares the branch&apos;s context.json digest at approval
          </p>
          {payload?.reviewerChecklist?.length ? (
            <div className="space-y-1">
              <p className="text-muted-foreground">Reviewer checklist · from the spec, not sent to Devin</p>
              <ol className="list-decimal space-y-0.5 pl-4" data-testid="reviewer-checklist">
                {payload.reviewerChecklist.map((line) => (
                  <li key={line}>{renderInlineMarkdown(line)}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="text-muted-foreground">
            The approver cannot be the requester. Switch to the engineer role if you asked for this
            run.
          </p>

          {stage === "idle" || stage === "failed" ? (
            <div className="space-y-2">
              {failure ? <p className="text-red-400">{failure}</p> : null}
              <div className="space-y-1">
                <Label htmlFor="approve-note" className="text-[11px] text-muted-foreground">
                  Note (optional)
                </Label>
                <SuggestTextarea
                  id="approve-note"
                  rows={2}
                  value={note}
                  onChange={setNote}
                  suggestion="Reviewed the change and its tests."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={pending}
                  onClick={confirm}
                  data-testid="confirm-approve"
                >
                  Approve as engineer
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 border-t border-border pt-3">
              <Row
                mark="GitHub"
                label="Approving review"
                detail="engineer"
                state={stage === "approving" ? "active" : "done"}
              />
              <Row
                mark="Devin"
                label="Devin merging"
                detail="squash into cognition-dashboard-devin-integration"
                state={
                  stage === "merging" ? "active" : stage === "merged" ? "done" : "waiting"
                }
              />
              <Row
                mark="Devin"
                label={stage === "merged" ? "Merged" : "Merged"}
                detail={payload?.run.mergeCommit?.slice(0, 7) ?? undefined}
                state={stage === "merged" ? "done" : "waiting"}
              />
              <Row
                mark="console"
                label={auditLabel}
                detail={stage === "merged" ? "record_merge" : "approve_pr"}
                state={stage === "approving" ? "waiting" : "done"}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
