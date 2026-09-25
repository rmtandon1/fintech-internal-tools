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
import { SimulatedRunView, SimulationBanner } from "@/components/simulated-run";
import type { SimulatedRun } from "@/lib/simulation";

/** Everything the drawer knows about the run it can ask for; no credentials, no context. */
export interface DispatchOffer {
  spec: string;
  clusterKey: string;
  evidenceIds: string[];
  /** Kinds this actor may start, each with the spec's default intent. */
  kinds: { kind: string; intent: string }[];
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
      if (!run) toast.error("No simulation for this kind", { description: kind });
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
        <Button size="sm" variant={variant} className="h-7 text-xs" data-testid="dispatch-run">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className={simulated ? "max-h-[85vh] overflow-auto sm:max-w-xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {reversal ? "Reverse this change" : "Dispatch a Devin run"}
          </DialogTitle>
        </DialogHeader>
        {simulation ? <SimulationBanner /> : null}
        {simulated ? (
          <div className="space-y-3">
            <SimulatedRunView run={simulated} />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setSimulated(null)}
            >
              Back
            </Button>
          </div>
        ) : (
          <form action={onSubmit} className="space-y-3">
            <input type="hidden" name="spec" value={offer.spec} />
            <input type="hidden" name="scope" value="rule" />
            <input type="hidden" name="clusterKey" value={offer.clusterKey} />
            {offer.reverses ? <input type="hidden" name="reverses" value={offer.reverses} /> : null}
            {offer.evidenceIds.map((id) => (
              <input key={id} type="hidden" name="evidenceIds" value={id} />
            ))}
            <p className="text-xs text-muted-foreground">
              Spec <span className="font-mono text-foreground">{offer.spec}</span>
              {offer.reverses ? (
                <>
                  {" "}· reverses <span className="font-mono text-foreground">{offer.reverses}</span>
                </>
              ) : (
                <>
                  {" "}· evidence{" "}
                  <span className="tabular-nums text-foreground">{offer.evidenceIds.length}</span> records
                </>
              )}{" "}
              · scope <span className="font-mono text-foreground">rule</span>
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
                Intent{reversal ? " · fixed by the spec" : ""}
              </Label>
              <Textarea
                id="dispatch-intent"
                name="intent"
                rows={4}
                maxLength={500}
                value={intent}
                readOnly={reversal}
                onChange={(e) => setIntent(e.target.value)}
                className="text-xs read-only:bg-muted read-only:text-muted-foreground"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {simulation
                ? "In a live console the server writes a PII-free context, records the dispatch, then opens the Devin session."
                : "The server writes a PII-free context, records the dispatch, then opens the Devin session."}
            </p>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={pending}>
              {simulation
                ? "Simulate run"
                : pending
                  ? "Dispatching…"
                  : reversal
                    ? "Dispatch reversal"
                    : "Dispatch"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
