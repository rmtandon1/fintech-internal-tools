"use client";

import { Button } from "@console/ui/button";
import { Icon } from "@console/ui/icon";
import { useWorkspace } from "@/components/workspace";
import type { Trigger } from "@/lib/run-triggers";

/**
 * The "Ask Devin" buttons for one screen. A button this role can't use is
 * shown greyed out with who can, so the role model is visible on screen.
 * An in-flight run opens directly in the Devin window.
 */
export function AskDevin({ triggers }: { triggers: Trigger[] }) {
  const { setAgentFocus } = useWorkspace();
  if (triggers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="ask-devin">
      {triggers.map((t) => {
        if (t.run) {
          const run = t.run;
          return (
            <span key={t.label} className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                data-testid="ask-devin-open-run"
                onClick={() => setAgentFocus({ kind: "run", runId: run.id })}
              >
                <Icon name="Bot" className="size-4" />
                {t.label}
              </Button>
              <span className="text-xs text-muted-foreground">{run.status}</span>
            </span>
          );
        }
        if (t.offer) {
          const offer = t.offer;
          return (
            <Button
              key={t.label}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setAgentFocus({ kind: "handoff", offer })}
            >
              <Icon name="Bot" className="size-4" />
              {t.label}
            </Button>
          );
        }
        return (
          <span key={t.label} className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled>
              <Icon name="Bot" className="size-4" />
              {t.label}
            </Button>
            <span className="text-xs text-muted-foreground">{t.blocked}</span>
          </span>
        );
      })}
    </div>
  );
}
