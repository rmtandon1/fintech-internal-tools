# Refund Clustering Hold

## Summary

- Four `not_received` refunds from one merchant each sit just under the $500 manager line and total $1,880. No rule catches them.
- A refunds manager asks Devin for a rule from the cluster drawer (`TRANSACTION_INSPECTION.md`). Devin writes `clustering_hold` in the refunds tool, a KYC rule that sends those customers' approvals to a manager, a window setting, and eight tests. No flag.
- An admin can switch the hold off in seconds by setting the window to 0.
- Devin later removes the hold from the code, keeping a later change to the same file.
- This spec gives Devin the intent, scope and acceptance tests. Shared run rules: `DEVIN_RUN_PROTOCOL.md`.

## The problem

`amount_approval` looks at one refund at a time. Four `not_received` refunds from Kestrel Outdoors at $480, $475, $460 and $465 each clear alone. Together they are $1,880 through a line meant to pull in a second approver at $500. One of the customers behind them has a KYC case pending at risk score 68, two points under the manager line.

Nothing in the console connects those facts, and no rule catches them.

## Add the hold (IMPLEMENTATION/ADDITION)

### Intent

The sentence the requester sends, prefilled from the cluster drawer and editable:

> Hold a merchant's not-received refunds once together they pass the manager line, and send those customers' KYC approvals to a manager.

It is deliberately short. It doesn't mention the window, rejected refunds, frozen-FX amounts or where the rule sits in the trace. The scope and acceptance tests below cover those, and Devin has to find them. That gap is what the viewer should notice (`AGENT_TRIGGER_SURFACE.md` § One sentence, not a chat panel).

### Scope

The files the run may plan to touch. Devin's `plan.json` must stay inside this list.

- `tools/refunds/src/clustering-hold.ts` (new): the refund rule and the shared "is this customer in a held cluster" query
- `tools/refunds/src/index.ts`: register the rule on `execute` and declare the window constant
- `tools/kyc/src/index.ts`: a rule on `approve`
- `apps/console/tests/tools/refunds-clustering-hold.test.ts` (new)
- `apps/console/tests/tools/kyc.test.ts`: new cases only

`packages/engine/` is out of scope. So is anything under `tools/flags/`, because this change does not use a flag.

### Acceptance tests

These are the contract. Devin makes them pass, and the reviewer checks that they are there and say what they should. The fixture comes from the run's `context.json` evidence, so the test reproduces the pattern that was actually seen.

Refunds:

1. The first refund in a cluster whose running total is under the manager line is applied.
2. The refund that takes the merchant's `not_received` total over the manager line within the window goes to `pending_approval` at the manager tier. The trace names `clustering_hold`, the merchant and the running total.
3. Every later refund in the same cluster is also held.
4. A `faulty` refund from the same merchant is not affected.
5. Rejected refunds don't count toward the total.
6. With `refunds.clustering_window_days` at 0, nothing is held. This is the KILL_SWITCH setting.

KYC:

7. Approving a case whose email matches a customer in a held cluster needs a manager, whatever the risk score. The trace names `linked_refund_hold`.
8. A case whose customer has no held refunds is unchanged. Score 68 still clears.

### Constraints

- The hold is a `require_approval` at the manager tier, with `allowedRoles: rolesFor("refunds", "manager")`. `linked_refund_hold` on the KYC side uses `rolesFor("kyc", "manager")`: the refunds manager asks for the rule, and a KYC manager decides the case. It never denies. A structuring pattern is a reason for a second person to look, not proof of fraud.
- `clustering_hold` sits after `goodwill_approval` in the `execute` rules, because rule order sets trace order and reviewers read the trace.
- The window is a runtime constant, `refunds.clustering_window_days`, default 14. The manager line is read from `refunds.manager_approval_usd_minor`, never copied.
- The KYC rule reads refunds through the shared query in `clustering-hold.ts`. It does not duplicate the sum.

### Reference implementation (reviewer only)

This is one correct answer for the refund half. An equivalent answer passes. The KYC half has no reference: how it reuses the query is Devin's call, and reviewing that call is the point.

```ts
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@console/db";
import type { Rule } from "@console/engine/types";
import { rolesFor } from "@console/permissions";
import { MANAGER_APPROVAL_USD_KEY, type Refund } from "./index";
import { refunds } from "./schema";

export const CLUSTERING_WINDOW_DAYS_KEY = "refunds.clustering_window_days";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Not-received refunds from one merchant are summed over a window, so a run
 * of refunds each under the manager line is held once the total crosses it.
 */
export const clusteringHold: Rule<Refund, unknown> = ({ record, constants }) => {
  const windowDays = constants.number(CLUSTERING_WINDOW_DAYS_KEY, 14);
  if (!record || record.reasonCode !== "not_received" || windowDays <= 0) {
    return { type: "allow", rule: "clustering_hold" };
  }
  const limit = constants.number(MANAGER_APPROVAL_USD_KEY, 50_000);
  const prior =
    db
      .select({ total: sql<number>`coalesce(sum(${refunds.usdMinor}), 0)` })
      .from(refunds)
      .where(
        and(
          eq(refunds.merchant, record.merchant),
          eq(refunds.reasonCode, "not_received"),
          ne(refunds.id, record.id),
          ne(refunds.status, "rejected"),
          gte(refunds.requestedAt, record.requestedAt - windowDays * DAY),
          lte(refunds.requestedAt, record.requestedAt),
        ),
      )
      .get()?.total ?? 0;
  const total = prior + record.usdMinor;
  return total >= limit
    ? {
        type: "require_approval",
        rule: "clustering_hold",
        tier: "manager",
        allowedRoles: rolesFor("refunds", "manager"),
        reason: `${record.merchant} not-received refunds total ${(total / 100).toFixed(2)} USD over ${windowDays} days, at or above the manager line`,
      }
    : { type: "allow", rule: "clustering_hold" };
};
```

The constant declaration in `tools/refunds/src/index.ts`:

```ts
    {
      key: CLUSTERING_WINDOW_DAYS_KEY,
      value: 14,
      type: "number",
      description: "Days of not-received refunds summed per merchant; 0 turns the hold off",
      tool: "refunds",
    },
```

### What the operator sees after merge

1. An engineer approves in the approval dialog, Devin merges, and `record_merge` is written. The checkout pulls, and the app reloads.
2. As `refunds_agent`, execute the next Kestrel `not_received` refund. It goes to the inbox instead of settling. The policy trace names `clustering_hold` and the $1,880 running total.
3. Open the linked KYC case (score 68). **Approve** now routes to a KYC manager, and the trace names `linked_refund_hold`.

Before the merge, the same two clicks settle the refund and clear the case. That before-and-after is the proof.

## Switch the hold off (KILL_SWITCH)

A setting change, with no Devin run. An admin sets `refunds.clustering_window_days` to 0 in `/admin/policy`. `setConstant` audits the change, and from the next refund nothing is held. Acceptance test 6 guarantees that 0 means off.

Use it when the hold is catching genuine refunds and a REVERSAL would take too long.

## Remove the hold (REVERSAL)

### When

A regional courier failure produces genuine `not_received` refunds at Fernhill Home, a long-standing merchant, and the hold sends about 60 of them to the manager inbox. The admin applies the KILL_SWITCH. Risk judges the rule too blunt and withdraws it while designing a narrower one. The recorded demo needs a Fernhill seed for this step: about 60 `not_received` refunds under $500 each, requested after the IMPLEMENTATION merges.

**Scenario data.** `pnpm db:scenario courier-outage` produces it: about 60 Fernhill Home `not_received` refunds between $30 and $450, ids `rfnd_1001`–`rfnd_1060`. The script inserts the rows and then submits each one through `executeIntent` as the refunds agent, so the live `clustering_hold` routes them to the manager inbox and every hold writes its own audit row. It is not a seed: it runs against the live `apps/console/data/console.db` after the IMPLEMENTATION has merged, and it is what fills the inbox the REVERSAL's PR has to list.

### Intent

> Reverse the clustering hold: remove the refund rule, the KYC link rule and the window constant, and keep everything merged since.

### What the reversal has to work through

By the time of reversal, the demo's branch should carry at least one later change to the same files. Record that change before recording the reversal, so the reversal has real work to do. That change is an ordinary PR that adds a `partial_delivery` reason code to `refunds/index.ts`. With that in place, a plain `git revert` of the IMPLEMENTATION conflicts: the codebase has moved on since that commit, and undoing it cleanly means knowing which later behaviour must survive. Devin has to read `partial_delivery` in the current file, decide it stays, and remove only the clustering rule around it — semantically undoing the earlier feature rather than mechanically reverting the commit:

- the revert conflicts in `tools/refunds/src/index.ts`, and Devin has to keep the new reason code while removing the rule
- the admin has changed the window since merge (to 0, via the KILL_SWITCH), so the PR reports that live row and says it will stay in the database until someone removes it
- refunds held by the rule are still in the inbox, and the PR lists them as operator steps: approve or reject each one

### Acceptance

- `pnpm verify` is green.
- Tests 1–8 are gone, and the plan names them. No other test is lost.
- The **Only undo** guard check passes against the IMPLEMENTATION's base commit.
- After merge, executing the next Kestrel refund settles it, as it did before the IMPLEMENTATION.

