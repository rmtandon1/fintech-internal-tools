"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { dispatchAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@console/ui/dialog";
import { Icon } from "@console/ui/icon";
import { Label } from "@console/ui/label";
import { Textarea } from "@console/ui/textarea";
import { SimulatedRunView, SimulationBanner } from "@/components/simulated-run";
import type { SimulatedRun } from "@/lib/simulation";

/** Everything the drawer knows about the run it can ask for; no credentials, no context. */
export interface DispatchOffer {
  spec: string;
  clusterKey: string;
  evidenceIds: string[];
  /** The pattern the request comes from, in one plain sentence. */
  context?: string;
  /** The records sent to Devin as examples, each with a short detail such as its amount. */
  evidence?: { id: string; detail: string }[];
  /** Kinds this actor may start, each with its display label and the spec's default intent. */
  kinds: { kind: string; label?: string; intent: string }[];
  /** The merged run a REVERSAL undoes; its intent is then the spec's, read-only. */
  reverses?: string | null;
  /**
   * Set in simulation mode (no `DEVIN_API_KEY`): the pre-written finished run
   * for each kind. Submitting then shows it here and calls no server action.
   */
  simulations?: Partial<Record<string, SimulatedRun>> | null;
}

export function DispatchControl({
  offer,
  label = "Ask Devin for a rule",
  variant = "default",
}: {
  offer: DispatchOffer;
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState(offer.kinds[0]?.kind ?? "");
  const intentFor = (k: string) => offer.kinds.find((o) => o.kind === k)?.intent ?? "";
  const [intent, setIntent] = useState(intentFor(kind));
  const [simulated, setSimulated] = useState<SimulatedRun | null>(null);

  if (offer.kinds.length === 0) return null;
  const reversal = kind === "REVERSAL";
  const simulation = offer.simulations ?? null;

  function onSubmit(form: FormData) {
    if (simulation) {
      const run = simulation[kind];
      setSimulated(run ? { ...run, intent } : null);
      if (!run) toast.error("No preview for this request");
      return;
    }
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSimulated(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} data-testid="dispatch-run">
          <Icon name="Sparkles" className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className={simulated ? "max-h-[85vh] overflow-auto sm:max-w-xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {reversal ? "Undo this rule change" : "Ask Devin for a new rule"}
          </DialogTitle>
          <DialogDescription>
            {reversal
              ? "Devin removes the rule from the code and keeps everything built since. An engineer reviews the change before it goes live."
              : "Describe what the rule should do. Devin writes it, tests it, and sends it to an engineer to review before it goes live."}
          </DialogDescription>
        </DialogHeader>
        {simulation ? <SimulationBanner /> : null}
        {simulated ? (
          <div className="space-y-3">
            <SimulatedRunView run={simulated} />
            <Button variant="outline" onClick={() => setSimulated(null)}>
              Back
            </Button>
          </div>
        ) : (
          <form action={onSubmit} className="space-y-4">
            <input type="hidden" name="spec" value={offer.spec} />
            <input type="hidden" name="scope" value="rule" />
            <input type="hidden" name="clusterKey" value={offer.clusterKey} />
            {offer.reverses ? <input type="hidden" name="reverses" value={offer.reverses} /> : null}
            {offer.evidenceIds.map((id) => (
              <input key={id} type="hidden" name="evidenceIds" value={id} />
            ))}

            {offer.context || (offer.evidence && offer.evidence.length > 0) ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  What Devin will see
                </div>
                {offer.context ? <p className="text-sm">{offer.context}</p> : null}
                {offer.evidence && offer.evidence.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {offer.evidence.map((row) => (
                      <li
                        key={row.id}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >
                        <span className="font-mono">{row.id}</span>
                        {row.detail ? (
                          <span className="ml-1.5 tabular-nums text-muted-foreground">
                            {row.detail}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Customer names, emails and card numbers are not shared.
                </p>
              </div>
            ) : null}

            {offer.kinds.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="dispatch-kind" className="text-sm">
                  What kind of change?
                </Label>
                <select
                  id="dispatch-kind"
                  name="kind"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    setIntent(intentFor(e.target.value));
                  }}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {offer.kinds.map((o) => (
                    <option key={o.kind} value={o.kind}>
                      {o.label ?? o.kind}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="kind" value={kind} />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="dispatch-intent" className="text-sm">
                {reversal ? "What will be undone" : "What should the rule do?"}
              </Label>
              <Textarea
                id="dispatch-intent"
                name="intent"
                rows={4}
                maxLength={500}
                value={intent}
                readOnly={reversal}
                onChange={(e) => setIntent(e.target.value)}
                className="text-sm read-only:bg-muted read-only:text-muted-foreground"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {simulation
                  ? "Preview the result"
                  : pending
                    ? "Sending…"
                    : reversal
                      ? "Ask Devin to undo it"
                      : "Send to Devin"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
