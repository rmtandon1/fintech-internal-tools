import type {
  PolicyDecision,
  Rule,
  RuleContext,
  RuleOutcome,
} from "../types";

/**
 * Runs every rule (no short-circuit, so the trace is always complete) and
 * resolves precedence: deny beats require_approval beats allow. An action
 * declaring no rules is denied — policy is default-deny.
 */
export function evaluatePolicy<TRecord, TInput>(
  rules: Rule<TRecord, TInput>[],
  ctx: RuleContext<TRecord, TInput>,
): PolicyDecision {
  const trace: RuleOutcome[] = rules.map((rule) => rule(ctx));

  if (trace.length === 0) {
    return {
      effect: "deny",
      trace: [
        {
          type: "deny",
          rule: "default_deny",
          reason: "No policy rules declared for this action",
        },
      ],
      reason: "No policy rules declared for this action",
    };
  }

  const denial = trace.find((o) => o.type === "deny");
  if (denial && denial.type === "deny") {
    return { effect: "deny", trace, reason: denial.reason };
  }

  const approval = trace.find((o) => o.type === "require_approval");
  if (approval && approval.type === "require_approval") {
    return {
      effect: "require_approval",
      trace,
      reason: approval.reason,
      tier: approval.tier,
      allowedRoles: approval.allowedRoles,
    };
  }

  return { effect: "allow", trace };
}
