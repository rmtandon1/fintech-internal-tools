"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveAutomationRun,
  type BridgeResult,
  observeAutomationMerge,
  pollAutomationRun,
  stopAutomationRun,
  syncAutomationRun,
} from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@console/ui/dialog";
import { Label } from "@console/ui/label";
import { Textarea } from "@console/ui/textarea";

/**
 * Which bridge steps the server offers this actor for this run. Approval
 * carries no checks or digest fields: the server reads those from GitHub.
 * `approve.visible` is true only for an engineer who did not request the
 * run; other actors never see the review control.
 */
export interface RunOffer {
  runId: string;
  poll: boolean;
  approve: { visible: boolean; offered: boolean; reason?: string };
  merge: boolean;
  /** The run merged but the local checkout does not have its merge commit yet. */
  sync: boolean;
  stop: { offered: boolean; reason?: string };
}

export function RunActions({ offer }: { offer: RunOffer }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);

  function run(task: () => Promise<BridgeResult>, close?: () => void) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) toast.success(result.title, { description: result.detail });
      else toast.error(result.title, { description: result.detail });
      if (result.ok) close?.();
      if (result.reload) router.refresh();
    });
  }

  /** Devin merges tens of seconds after approve_pr: retry while the server says so. */
  async function checkMerge(): Promise<BridgeResult> {
    let result = await observeAutomationMerge(offer.runId);
    for (let attempt = 1; result.retry && attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await observeAutomationMerge(offer.runId);
    }
    return result;
  }

  return (
    <>
      {offer.poll ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={pending}
          onClick={() => run(() => pollAutomationRun(offer.runId))}
        >
          Poll session
        </Button>
      ) : null}

      {offer.approve.visible ? (
        <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={pending || !offer.approve.offered}
              title={offer.approve.reason}
              data-testid="approve-pr"
            >
              Review and approve
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Review and approve the run&apos;s pull request</DialogTitle>
            </DialogHeader>
            <form
              action={(form) =>
                run(
                  () => approveAutomationRun(offer.runId, String(form.get("note") ?? "")),
                  () => setApproveOpen(false),
                )
              }
              className="space-y-3"
            >
              <p className="text-xs text-muted-foreground">
                The server reads the head&apos;s checks and the branch&apos;s{" "}
                <span className="font-mono">context.json</span> digest from GitHub. The review is
                submitted only once the approval is recorded here.
              </p>
              <div className="space-y-1">
                <Label htmlFor="approve-note" className="text-[11px] text-muted-foreground">
                  Note (optional)
                </Label>
                <Textarea id="approve-note" name="note" rows={2} className="text-xs" />
              </div>
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={pending}>
                {pending ? "Checking GitHub…" : "Approve"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {offer.merge ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={pending}
          onClick={() => run(checkMerge)}
        >
          Check merge
        </Button>
      ) : null}

      {offer.sync ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={pending}
          onClick={() => run(() => syncAutomationRun(offer.runId))}
        >
          Pull merged code
        </Button>
      ) : null}

      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            disabled={pending || !offer.stop.offered}
            title={offer.stop.reason}
            data-testid="stop-run"
          >
            Stop
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Stop the run</DialogTitle>
          </DialogHeader>
          <form
            action={(form) =>
              run(
                () => stopAutomationRun(offer.runId, String(form.get("reason") ?? "")),
                () => setStopOpen(false),
              )
            }
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label htmlFor="stop-reason" className="text-[11px] text-muted-foreground">
                Reason
              </Label>
              <Textarea id="stop-reason" name="reason" rows={2} required className="text-xs" />
            </div>
            <Button type="submit" size="sm" variant="destructive" className="h-7 text-xs" disabled={pending}>
              {pending ? "Stopping…" : "Terminate session and stop"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
