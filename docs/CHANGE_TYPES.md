# Change Types

## Summary

- Most changes to the console need no Devin and no engineer: thresholds and emergency switch-offs are settings, and product flags are rows in the flags app.
- Devin writes code only where a setting can't express the change: adding or removing a rule, adding an app, or changing a requirement every app shares.
- Engine design, such as a new approval type, stays with engineering. Devin can implement it under engineering review.
- The console's own policy rules never use feature flags. The fintech's product flags stay flags, governed by the console.

The Loom uses the add, switch-off and remove rows, and shows "Add an app" as a commit, not a run.

## Which path each change takes


| Change                                | Example in this console                                          | Path                                                                                                                                  | Devin?                              |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Tune a threshold                      | `refunds.manager_approval_usd_minor` from $500 to $750           | `/admin/policy`, seconds, audited                                                                                                     | No                                  |
| Switch a rule off in an emergency     | `refunds.clustering_window_days` to 0                            | `/admin/policy`, seconds, audited                                                                                                     | No                                  |
| Move a product flag                   | `payments.instant_payouts` from 25% to 50%                       | Flags app, under its own policy rules                                                                                                 | No                                  |
| Add a rule                            | Hold clustered `not_received` refunds                            | Devin run, pull request, engineer approval, Devin merge                                                                               | Yes                                 |
| Remove a rule                         | Take the clustering hold back out                                | Devin reversal, same gates                                                                                                            | Yes                                 |
| Add an app                            | `flags`, the third app Devin built, with `packages/engine/` untouched | Larger Devin run, same guards                                                                                                         | Yes                                 |
| Change a requirement every app shares | A reason and a ticket reference on every privileged action       | Devin run with engine scope. The engine owner approves as well as an engineer, and the reviewer checks every path before merge        | Yes, with the engine owner's review |
| Change the engine                     | Refunds above a line need two different managers                 | An engineer designs it: a second approval record, a quorum check, a schema migration. Devin can implement it under engineering review | Not on its own                      |


Adding a rule is probably the change that needs code most often. That is an assumption, with no client data behind it. The clustering hold is a hard example of it:

- No setting or flag for it could exist in advance, because nobody had seen the pattern.
- It reads two apps, which Power Apps keeps apart.
- It moves money, so review matters.
- It has edge cases the code already handles: rejected refunds, goodwill refunds, fixed exchange rates.
- Later it has to be undone.



## Policy rules and product flags

Two kinds of switch are easy to confuse.

**The console's policy rules** are the functions each tool declares in `tools/<tool>/src/index.ts`: `amount_approval`, `goodwill_approval`, `risk_tier_approval`, `production_enable` and the rest. The engine runs them on every write to decide whether to allow it, send it for approval, or deny it. They control money and customer access. They don't use flags, for three reasons:

- **Thresholds can already change at runtime.** `refunds.manager_approval_usd_minor` changes from `/admin/policy` in seconds, with before and after in the audit log. A flag would add a second on/off lever on top: a branch that is either dead or a way around the control.
- **A flag on a control is a quiet off switch.** Turning a control off deserves at least as much scrutiny as adding it. A flag turns it off with one click and none of the code's review. A reviewed removal, plus a switch-off value inside the rule's own setting, gives the fast path without a hidden one.
- **Nobody can flag a pattern they haven't seen.** This client's rules come from patterns found in the queue. A new rule should cost one reviewed pull request, not a flag built in advance.

**The fintech's product flags** are the rows in the flags app: `payments.instant_payouts` at 25% rollout, `payments.card_network_failover` as an emergency switch, `onboarding.document_autocapture`. In the fiction, the fintech's own product services read them. In the repo, nothing does. They stay flags, because gradual rollouts to customers and seconds-fast failover are what flags are for. The console governs changes to them through its own policy rules: a manager for customer-facing enables, rollout steps of at most 25 points, an admin for permission flags. That is the feature-flag admin panel in the client's brief.

The rule: **console policy rules are code, changed by Devin. Product behaviour that must reach customers gradually, or switch in seconds, stays behind flags the console governs.**