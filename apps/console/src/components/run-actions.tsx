"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveAutomationRun,
  type BridgeResult,
  observeAutomationMerge,
  pollAutomationRun,
  stopAutomationRun,
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
 */
export interface RunOffer {
  runId: string;
  poll: boolean;
  approve: { offered: boolean; reason?: string };
  merge: boolean;
  stop: { offered: boolean; reason?: string };
}

export function RunActions({ offer }: { offer: RunOffer }) {
  const [pending, startTransition] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);

  function run(task: () => Promise<BridgeResult>, close?: () => void) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) toast.success(result.title, { description: result.detail });
      else toast.error(result.title, { description: result.detail });
      if (result.ok) close?.();
    });
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

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={pending || !offer.approve.offered}
            title={offer.approve.reason}
            data-testid="approve-pr"
          >
            Approve PR
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Approve the run&apos;s pull request</DialogTitle>
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

      {offer.merge ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={pending}
          onClick={() => run(() => observeAutomationMerge(offer.runId))}
        >
          Check merge
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
