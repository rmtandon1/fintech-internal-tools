"use client";

import { Button } from "@console/ui/button";
import { useWorkspace } from "@/components/workspace";
import type { HandoffOffer } from "@/lib/handoff";

export interface RuleRow {
  spec: string;
  /** Buttons, in spec order. Disabled entries carry the reason as a title. */
  actions: {
    kind: string;
    label: string;
    enabled: boolean;
    reason?: string;
    offer?: HandoffOffer;
  }[];
}

/** Runnable specs on /admin/policy: what Devin may be asked to do to each rule. */
export function RulesCard({ rows }: { rows: RuleRow[] }) {
  const { setAgentFocus } = useWorkspace();
  return (
    <div className="space-y-1 rounded-lg border border-border p-3" data-testid="rules-card">
      {rows.map((row) => (
        <div key={row.spec} className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{row.spec}</span>
          <span className="ml-auto flex gap-2">
            {row.actions.map((action) => (
              <Button
                key={action.kind}
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={!action.enabled}
                title={action.enabled ? undefined : action.reason}
                onClick={() =>
                  action.offer && setAgentFocus({ kind: "handoff", offer: action.offer })
                }
              >
                {action.label}
              </Button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
