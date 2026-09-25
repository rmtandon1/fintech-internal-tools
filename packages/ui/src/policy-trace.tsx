import { Icon } from "./icon";
import type { PolicyDecision, RuleOutcome } from "@console/engine/types";
import { cn } from "./utils";

const TONE: Record<RuleOutcome["type"], { icon: string; className: string; word: string }> = {
  allow: { icon: "Check", className: "text-emerald-400", word: "allow" },
  deny: { icon: "Ban", className: "text-red-400", word: "deny" },
  require_approval: {
    icon: "UserCheck",
    className: "text-amber-400",
    word: "approval",
  },
};

export function PolicyOutcomeLine({ decision }: { decision: PolicyDecision }) {
  const tone = TONE[decision.effect === "allow" ? "allow" : decision.effect];
  return (
    <div className={cn("flex items-center gap-1.5 text-xs", tone.className)}>
      <Icon name={tone.icon} className="size-3.5" />
      <span>
        {tone.word}
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
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">No rules evaluated.</p>
    );
  }
  return (
    <ul className={className}>
      {trace.map((outcome, index) => {
        const tone = TONE[outcome.type];
        return (
          <li
            key={`${outcome.rule}-${index}`}
            className="grid h-7 grid-cols-[72px_1fr_auto] items-center gap-2 px-3 text-xs"
          >
            <span className={cn("font-mono lowercase", tone.className)}>
              {tone.word}
            </span>
            <span className="truncate font-mono">{outcome.rule}</span>
            <span className="truncate text-right text-muted-foreground">
              {outcome.type === "allow"
                ? (outcome.message ?? "")
                : outcome.reason}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
