import { Icon } from "./icon";
import type { PolicyDecision, RuleOutcome } from "@console/engine/types";
import { humanize } from "./format";
import { cn } from "./utils";

const TONE: Record<RuleOutcome["type"], { icon: string; className: string; word: string }> = {
  allow: { icon: "Check", className: "text-emerald-400", word: "Passed" },
  deny: { icon: "Ban", className: "text-red-400", word: "Blocked" },
  require_approval: {
    icon: "UserCheck",
    className: "text-amber-400",
    word: "Needs approval",
  },
};

/** The operator-facing name of a rule: the tool's label, else the id read as words. */
export function ruleLabel(rule: string, labels?: Record<string, string>): string {
  return labels?.[rule] ?? humanize(rule);
}

export function PolicyOutcomeLine({ decision }: { decision: PolicyDecision }) {
  const tone = TONE[decision.effect === "allow" ? "allow" : decision.effect];
  return (
    <div className={cn("flex items-center gap-1.5 text-sm", tone.className)}>
      <Icon name={tone.icon} className="size-4" />
      <span>
        {tone.word}
        {decision.reason ? `: ${decision.reason}` : ""}
      </span>
    </div>
  );
}

/**
 * Every check that decided an action, one line each: what was checked and,
 * when it stopped or routed the action, why. Rule ids stay out of sight.
 */
export function PolicyTraceList({
  trace,
  labels,
  className,
}: {
  trace: RuleOutcome[];
  labels?: Record<string, string>;
  className?: string;
}) {
  if (trace.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">No checks apply.</p>;
  }
  return (
    <ul className={cn("divide-y divide-border/60", className)}>
      {trace.map((outcome, index) => {
        const tone = TONE[outcome.type];
        const detail = outcome.type === "allow" ? outcome.message : outcome.reason;
        return (
          <li
            key={`${outcome.rule}-${index}`}
            className="flex items-start gap-2.5 px-3 py-2 text-sm"
            title={outcome.rule}
          >
            <Icon name={tone.icon} className={cn("mt-0.5 size-4 shrink-0", tone.className)} />
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{ruleLabel(outcome.rule, labels)}</span>
              {detail ? (
                <span className="block text-[13px] text-muted-foreground">{detail}</span>
              ) : null}
            </span>
            {outcome.type !== "allow" ? (
              <span className={cn("shrink-0 text-xs font-medium", tone.className)}>
                {tone.word}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
