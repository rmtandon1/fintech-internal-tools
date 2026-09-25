"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { dispatchAutomationRun } from "@/app/automation-actions";
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

/** Everything the drawer knows about the run it can ask for; no credentials, no context. */
export interface DispatchOffer {
  spec: string;
  clusterKey: string;
  evidenceIds: string[];
  /** Kinds this actor may start, each with the spec's default intent. */
  kinds: { kind: string; intent: string }[];
}

export function DispatchControl({ offer }: { offer: DispatchOffer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState(offer.kinds[0]?.kind ?? "");
  const intentFor = (k: string) => offer.kinds.find((o) => o.kind === k)?.intent ?? "";
  const [intent, setIntent] = useState(intentFor(kind));

  if (offer.kinds.length === 0) return null;

  function onSubmit(form: FormData) {
    startTransition(async () => {
      const result = await dispatchAutomationRun(form);
      if (result.ok) {
        toast.success(result.title, { description: result.detail });
      } else {
        toast.error(result.title, { description: result.detail });
      }
      if (result.href) {
        setOpen(false);
        router.push(result.href);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-xs" data-testid="dispatch-run">
          Ask Devin for a rule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Dispatch a Devin run</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-3">
          <input type="hidden" name="spec" value={offer.spec} />
          <input type="hidden" name="scope" value="rule" />
          <input type="hidden" name="clusterKey" value={offer.clusterKey} />
          {offer.evidenceIds.map((id) => (
            <input key={id} type="hidden" name="evidenceIds" value={id} />
          ))}
          <p className="text-xs text-muted-foreground">
            Spec <span className="font-mono text-foreground">{offer.spec}</span> · evidence{" "}
            <span className="tabular-nums text-foreground">{offer.evidenceIds.length}</span> records ·
            scope <span className="font-mono text-foreground">rule</span>
          </p>
          <div className="space-y-1">
            <Label htmlFor="dispatch-kind" className="text-[11px] text-muted-foreground">
              Kind
            </Label>
            <select
              id="dispatch-kind"
              name="kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setIntent(intentFor(e.target.value));
              }}
              className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {offer.kinds.map((o) => (
                <option key={o.kind} value={o.kind}>
                  {o.kind}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dispatch-intent" className="text-[11px] text-muted-foreground">
              Intent
            </Label>
            <Textarea
              id="dispatch-intent"
              name="intent"
              rows={4}
              maxLength={500}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="text-xs"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            The server writes a PII-free context, records the dispatch, then opens the Devin session.
          </p>
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={pending}>
            {pending ? "Dispatching…" : "Dispatch"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
