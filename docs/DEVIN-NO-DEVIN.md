# Devin / No Devin

## Summary

- Most changes to the console need no Devin and no engineer
- Devin writes code only where a setting can't express the change: adding or removing a rule, adding an app, or changing a requirement every app shares.
- Engine design, such as a new approval type, stays with engineering. Devin can implement it under engineering review.

## Which path each change takes


| Change                                | Example in this console                                          | Path                                                                                                                                  | Devin?                              |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Tune a threshold                      | `refunds.manager_approval_usd_minor` from $500 to $750           | `/admin/policy`, seconds, audited                                                                                                     | No                                  |
| Switch a rule off in an emergency     | The rule's own setting, at the value that turns it off           | `/admin/policy`, seconds, audited                                                                                                     | No                                  |
| Move a product flag                   | `payments.instant_payouts` from 25% to 50%                       | Flags app, under its own policy rules                                                                                                 | No                                  |
| Add a rule or a check                 | Check UK businesses on Companies House (Demo 1)                  | Devin run, pull request, engineer approval, Devin merge                                                                               | Yes                                 |
| Remove a rule                         | Take the Companies House check back out                          | Devin reversal, same gates                                                                                                            | Yes                                 |
| Add an app                            | Chargebacks, rebuilt from its Power Apps export (Demo 3)         | Larger Devin run, same guards                                                                                                         | Yes                                 |
| Change a requirement every app shares | A reason and a ticket reference on every privileged action       | Devin run with engine scope. The engine owner approves as well as an engineer, and the reviewer checks every path before merge        | Yes, with the engine owner's review |
| Change the engine                     | Refunds above a line need two different approvers (Demo 2)       | An engineer designs it: a record per approver, a quorum check, a migration. Devin implements that design, and the engine owner reviews | Yes, from engineering's design      |


Adding a rule or a check is probably the change that needs code most often. That is an assumption, with no client data behind it. The Companies House check is a hard example of it:

- It needs outside data, which a Power Automate flow reaches only through a premium connector licensed per user.
- It needs a key kept on the server and never shown to the browser.
- Its failure mode matters: an outage at Companies House must hold a case, not wave it through.
- It feeds a register and a rule the console already has, so it should reuse them rather than add its own.
- Later it may have to be undone.



## Policy rules and product flags

Two kinds of switch are easy to confuse.

**The console's policy rules** are the functions each tool declares in `tools/<tool>/src/index.ts`: `amount_approval`, `goodwill_approval`, `risk_tier_approval`, `production_enable` and the rest. The engine runs them on every write to decide whether to allow it, send it for approval, or deny it. They control money and customer access. They don't use flags, for three reasons:

- **Thresholds can already change at runtime.** `refunds.manager_approval_usd_minor` changes from `/admin/policy` in seconds, with before and after in the audit log. A flag would add a second on/off lever on top: a branch that is either dead or a way around the control.
- **A flag on a control is a quiet off switch.** Turning a control off deserves at least as much scrutiny as adding it. A flag turns it off with one click and none of the code's review. A reviewed removal, plus a switch-off value inside the rule's own setting, gives the fast path without a hidden one.
- **Nobody can flag a pattern they haven't seen.** This client's rules come from patterns found in the queue. A new rule should cost one reviewed pull request, not a flag built in advance.

**The fintech's product flags** are the rows in the flags app: `payments.instant_payouts` at 25% rollout, `payments.card_network_failover` as an emergency switch, `onboarding.document_autocapture`. In the fiction, the fintech's own product services read them. In the repo, nothing does. They stay flags, because gradual rollouts to customers and seconds-fast failover are what flags are for. The console governs changes to them through its own policy rules: a manager for customer-facing enables, rollout steps of at most 25 points, an admin for permission flags. That is the feature-flag admin panel in the client's brief.
