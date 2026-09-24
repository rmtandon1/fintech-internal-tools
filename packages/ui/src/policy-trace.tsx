import { Icon } from "./icon";
import type { PolicyDecision, RuleOutcome } from "@console/engine/types";
import { cn } from "./utils";
import { titleCase } from "./format";

const TONE: Record<RuleOutcome["type"], { icon: string; className: string; label: string }> = {
  allow: { icon: "Check", className: "text-emerald-400", label: "Allowed" },
  deny: { icon: "Ban", className: "text-red-400", label: "Denied" },
  require_approval: {
    icon: "UserCheck",
    className: "text-amber-400",
    label: "Approval required",
  },
};

export function PolicyOutcomeLine({ decision }: { decision: PolicyDecision }) {
  const tone = TONE[decision.effect === "allow" ? "allow" : decision.effect];
  return (
    <div className={cn("flex items-center gap-1.5 text-xs", tone.className)}>
      <Icon name={tone.icon} className="size-3.5" />
      <span>
        {tone.label}
        {decision.reason ? `: ${decision.reason}` : ""}
      </span>
    </div>
  );
}

/** The complete list of rule outcomes that produced a decision. */
export function PolicyTraceList({
  trace,
  className,
}: {
  trace: RuleOutcome[];
  className?: string;
}) {
  if (trace.length === 0) {
    return <p className="text-xs text-muted-foreground">No rules evaluated.</p>;
  }
  return (
    <ul className={cn("space-y-1", className)}>
      {trace.map((outcome, index) => {
        const tone = TONE[outcome.type];
        return (
          <li key={`${outcome.rule}-${index}`} className="flex items-start gap-2 text-xs">
            <Icon name={tone.icon} className={cn("mt-0.5 size-3.5 shrink-0", tone.className)} />
            <span className="font-mono text-[11px] text-muted-foreground">
              {titleCase(outcome.rule)}
            </span>
            <span className={cn("ml-auto text-right", tone.className)}>
              {outcome.type === "allow"
                ? (outcome.message ?? "allow")
                : outcome.reason}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
