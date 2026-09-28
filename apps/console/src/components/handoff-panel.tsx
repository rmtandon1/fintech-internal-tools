"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { dispatchAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import { Label } from "@console/ui/label";
import { Textarea } from "@console/ui/textarea";
import { useWorkspace } from "@/components/workspace";
import { factLabel, factValue } from "@/lib/fact-format";
import type { HandoffOffer } from "@/lib/handoff";

/**
 * The handoff: the request, prefilled from the spec and editable, and
 * everything the system attaches to it. Rendered in the Devin window from
 * `AgentFocus` ("handoff"). Without `DEVIN_API_KEY` the brief is shown and
 * the send button is disabled.
 */
export function HandoffPanel({ offer }: { offer: HandoffOffer }) {
  const { setAgentFocus } = useWorkspace();
  const [intent, setIntent] = useState(offer.intent);
  const [pending, startTransition] = useTransition();
  const undo = offer.operation === "undo";

  function start() {
    const form = new FormData();
    form.set("spec", offer.spec);
    form.set("operation", offer.operation);
    form.set("intent", intent);
    if (offer.reverses) form.set("reverses", offer.reverses.runId);
    if (offer.evidenceKey) form.set("evidenceKey", offer.evidenceKey);
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
        <h3 className="text-base font-semibold">{offer.title}</h3>
        <p className="text-muted-foreground">{offer.description}</p>
      </div>

      {!offer.live ? (
        <div
          className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-warning"
          data-testid="devin-not-connected"
        >
          <span className="font-semibold">Devin isn&apos;t connected.</span> You can read the
          request, but it can&apos;t be sent until the server has a Devin key.
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
        <div className="text-xs font-medium text-muted-foreground">What Devin will see</div>
        {offer.reverses ? (
          <p>
            The change to undo: <span className="font-mono">{offer.reverses.runId}</span>
          </p>
        ) : null}
        {offer.evidence.length > 0 ? (
          <ul className="space-y-1.5">
            {offer.evidence.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono">{row.id}</span>
                <span className="ml-2 text-muted-foreground">
                  {Object.entries(row.facts)
                    .filter(([key]) => key !== "path")
                    .map(([key, value]) => `${factLabel(key)} ${factValue(offer.evidenceLabels, key, value)}`)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No records attached.</p>
        )}
        <p className="text-xs text-muted-foreground">
          People&apos;s names, emails, card numbers and ID documents are never shared.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="handoff-intent" className="text-sm">
          {undo ? "What will be undone" : "The request"}
        </Label>
        <Textarea
          id="handoff-intent"
          rows={6}
          maxLength={500}
          value={intent}
          readOnly={undo}
          onChange={(e) => setIntent(e.target.value)}
          className="text-sm read-only:bg-muted read-only:text-muted-foreground"
          aria-label="Intent"
        />
        <p className="text-xs text-muted-foreground">
          {undo
            ? "An undo carries no free text."
            : "Written in advance and yours to edit. This is the whole brief Devin gets."}
        </p>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Technical details
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Change</dt>
          <dd>
            {offer.operationLabel} <span className="font-mono text-muted-foreground">{offer.operation}</span>
          </dd>
          <dt className="text-muted-foreground">Starts from</dt>
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
              {offer.allowedPaths.map((path) => (
                <li key={path} className="font-mono">
                  {path}
                </li>
              ))}
            </ul>
          </dd>
          <dt className="text-muted-foreground">Checks</dt>
          <dd>
            Lint · Typecheck · Boundaries · Run guard · Test; approved by an engineer who didn&apos;t
            ask for it
          </dd>
        </dl>
      </details>

      <div className="mt-auto flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setAgentFocus(null)}>
          Cancel
        </Button>
        <Button
          disabled={!offer.live || pending || intent.trim().length === 0}
          onClick={start}
          data-testid="start-run"
        >
          {pending ? "Sending…" : undo ? "Ask Devin to undo it" : "Send to Devin"}
        </Button>
      </div>
    </div>
  );
}
