"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { dispatchAutomationRun } from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import { Textarea } from "@console/ui/textarea";
import { formatMinorUnits, formatRelative } from "@console/ui/format";
import { useWorkspace } from "@/components/workspace";
import { SimulationBanner, SimulatedRunView } from "@/components/simulated-run";
import type { HandoffOffer } from "@/lib/handoff";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-2">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

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
  const simulation = offer.simulations?.[offer.kind] ?? null;

  if (simulating && simulation) {
    return (
      <div className="flex min-h-0 flex-1 flex-col text-xs" data-testid="handoff-panel">
        <SimulationBanner />
        <SimulatedRunView run={simulation} />
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
    <div className="flex min-h-0 flex-1 flex-col text-xs" data-testid="handoff-panel">
      <Group title="Request">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground">{offer.kind}</span>
          <span>·</span>
          <span className="font-mono">{offer.spec}</span>
          {offer.reverses ? (
            <>
              <span>·</span>
              <span>
                reverses <span className="font-mono">{offer.reverses.runId}</span>
              </span>
            </>
          ) : null}
        </div>
        <Textarea
          rows={3}
          maxLength={500}
          value={intent}
          readOnly={offer.kind === "REVERSAL"}
          onChange={(e) => setIntent(e.target.value)}
          className="text-xs"
          aria-label="Intent"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {offer.kind === "REVERSAL"
            ? "Fixed by the spec; a reversal carries no free text."
            : "The only free text in the flow; everything below is supplied by the system."}
        </p>
      </Group>

      <Group title="Context">
        {offer.evidence.length > 0 ? (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal">id</th>
                <th className="font-normal">merchant</th>
                <th className="font-normal">reason</th>
                <th className="font-normal text-right">usd</th>
                <th className="font-normal">requested</th>
              </tr>
            </thead>
            <tbody>
              {offer.evidence.map((row) => (
                <tr key={row.id} className="border-t border-border/50">
                  <td className="py-0.5 pr-2 font-mono">{row.id}</td>
                  <td className="pr-2">{row.merchant}</td>
                  <td className="pr-2 font-mono">{row.reasonCode}</td>
                  <td className="pr-2 text-right tabular-nums">
                    {formatMinorUnits(row.usdMinor, "USD")}
                  </td>
                  <td className="text-muted-foreground">
                    {formatRelative(Date.parse(row.requestedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] text-muted-foreground">No evidence rows.</p>
        )}
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {Object.entries(offer.constants).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-muted-foreground">{key}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">base</dt>
          <dd className="font-mono">
            {offer.base.branch}@{offer.base.commit.slice(0, 7)}
          </dd>
        </dl>
      </Group>

      <Group title="Guardrails">
        <ul className="space-y-0.5 text-[11px]">
          {offer.scopePaths.map((path) => (
            <li key={path} className="font-mono text-muted-foreground">
              {path}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-muted-foreground">
          The PR&rsquo;s checks: Lint · Typecheck · Boundaries · Test. Approval: an engineer who did
          not request the run
        </p>
      </Group>

      <Group title="Execution">
        <p className="mb-2 text-[11px] text-muted-foreground">
          {offer.simulations === null ? (
            <>
              <span className="font-medium text-foreground">Live</span> · api.devin.ai
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">Simulation</span> · pre-written run, no
              key configured — nothing is dispatched or recorded
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={pending || intent.trim().length === 0 || (offer.simulations !== null && !simulation)}
            onClick={offer.simulations === null ? start : () => setSimulating(true)}
            data-testid="start-run"
          >
            {pending ? "Dispatching…" : offer.simulations === null ? "Start run" : "Simulate run"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setAgentFocus(null)}
          >
            Cancel
          </Button>
        </div>
      </Group>
    </div>
  );
}
