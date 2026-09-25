"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { dispatchAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import { Label } from "@console/ui/label";
import { Textarea } from "@console/ui/textarea";
import { formatMinorUnits } from "@console/ui/format";
import { useWorkspace } from "@/components/workspace";
import { SimulationBanner, SimulatedRunView } from "@/components/simulated-run";
import type { HandoffOffer } from "@/lib/handoff";

/**
 * The one-sentence handoff: the requester writes the intent and the system
 * supplies the evidence, scope and mode. Rendered in the Devin window from
 * `AgentFocus` ("handoff"). Without `DEVIN_API_KEY` the start button plays a
 * pre-written run locally instead of dispatching anything.
 */
export function HandoffPanel({ offer }: { offer: HandoffOffer }) {
  const { setAgentFocus } = useWorkspace();
  const [intent, setIntent] = useState(offer.intent);
  const [pending, startTransition] = useTransition();
  const [simulating, setSimulating] = useState(false);
  const reversal = offer.kind === "REVERSAL";
  const simulation = offer.simulations?.[offer.kind] ?? null;
  const live = offer.simulations === null;

  if (simulating && simulation) {
    return (
      <div className="flex min-h-0 flex-1 flex-col text-sm" data-testid="handoff-panel">
        <SimulationBanner />
        <SimulatedRunView run={{ ...simulation, intent }} />
        <div className="border-t border-border p-4">
          <Button variant="outline" onClick={() => setSimulating(false)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  function start() {
    const form = new FormData();
    form.set("spec", offer.spec);
    form.set("kind", offer.kind);
    form.set("scope", offer.scope);
    form.set("intent", intent);
    if (offer.reverses) form.set("reverses", offer.reverses.runId);
    if (offer.clusterKey) form.set("clusterKey", offer.clusterKey);
    for (const id of offer.evidenceIds) form.append("evidenceIds", id);
    startTransition(async () => {
      const result = await dispatchAutomationRun(form);
      if (result.ok && result.runId) {
        toast.success(result.title, { description: result.detail });
        setAgentFocus({ kind: "run", runId: result.runId });
      } else {
        toast.error(result.title, { description: result.detail });
      }
    });
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 text-sm"
      data-testid="handoff-panel"
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold">
          {reversal ? "Undo this rule change" : "Ask Devin for a new rule"}
        </h3>
        <p className="text-muted-foreground">
          {reversal
            ? "Devin removes the rule from the code and keeps everything built since. An engineer reviews the change before it goes live."
            : "Describe what the rule should do. Devin writes it, tests it, and sends it to an engineer to review before it goes live."}
        </p>
      </div>

      {!live ? <SimulationBanner /> : null}

      <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
        <div className="text-xs font-medium text-muted-foreground">What Devin will see</div>
        {offer.reverses ? (
          <p>
            The change to undo: <span className="font-mono">{offer.reverses.runId}</span>
          </p>
        ) : null}
        {offer.evidence.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {offer.evidence.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <span className="font-mono">{row.id}</span>
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {formatMinorUnits(row.usdMinor, "USD")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No examples attached.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Customer names, emails and card numbers are not shared.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="handoff-intent" className="text-sm">
          {reversal ? "What will be undone" : "What should the rule do?"}
        </Label>
        <Textarea
          id="handoff-intent"
          rows={4}
          maxLength={500}
          value={intent}
          readOnly={reversal}
          onChange={(e) => setIntent(e.target.value)}
          className="text-sm read-only:bg-muted read-only:text-muted-foreground"
          aria-label="Intent"
        />
        {reversal ? (
          <p className="text-xs text-muted-foreground">
            Set by the rule&apos;s spec; undoing a change carries no free text.
          </p>
        ) : null}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Technical details
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Change</dt>
          <dd>
            {offer.kindLabel} <span className="font-mono text-muted-foreground">{offer.kind}</span>
          </dd>
          <dt className="text-muted-foreground">Spec</dt>
          <dd className="font-mono">{offer.spec}</dd>
          <dt className="text-muted-foreground">Base</dt>
          <dd className="font-mono">
            {offer.base.branch}@{offer.base.commit.slice(0, 7)}
          </dd>
          {Object.entries(offer.constants).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-muted-foreground">{key}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Allowed files</dt>
          <dd>
            <ul className="space-y-0.5">
              {offer.scopePaths.map((path) => (
                <li key={path} className="font-mono">
                  {path}
                </li>
              ))}
            </ul>
          </dd>
          <dt className="text-muted-foreground">Checks</dt>
          <dd>Lint · Typecheck · Boundaries · Test; approved by an engineer who did not ask for it</dd>
          <dt className="text-muted-foreground">Mode</dt>
          <dd>{live ? "Live · api.devin.ai" : "Preview · nothing is sent or recorded"}</dd>
        </dl>
      </details>

      <div className="mt-auto flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setAgentFocus(null)}>
          Cancel
        </Button>
        <Button
          disabled={pending || intent.trim().length === 0 || (!live && !simulation)}
          onClick={live ? start : () => setSimulating(true)}
          data-testid="start-run"
        >
          {!live
            ? "Preview the result"
            : pending
              ? "Sending…"
              : reversal
                ? "Ask Devin to undo it"
                : "Send to Devin"}
        </Button>
      </div>
    </div>
  );
}
