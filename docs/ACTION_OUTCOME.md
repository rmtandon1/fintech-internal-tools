# Action Outcome Panel

## Summary

- After an operator clicks an action on a record, a panel replaces today's toast. It shows what the engine did: the permission check, the policy rules, who decided and when, and the audit row written.
- Every line is read from the result and the audit row. A line with no value isn't shown.
- The panel renders from `IntentOutcome`, so every tool gets it, `flags` included, with no tool code.
- It is the demo's proof shot: after the clustering hold merges, the panel names the rule that routes `rfnd_0013` to the manager, in one frame.
- Two pull requests: a small engine change that returns the audit row id, then the component. Normal feature work.
- The panel shows only what the engine did. Nothing downstream exists yet, so no line claims it.

## Problem

`apps/console/src/components/action-panel.tsx` shows `toast.success(outcome.summary)`, and the toast fades. By then the engine has checked the role, run every rule, bumped the record version under a version guard, and appended a hash-chained audit row, all in one transaction. The screen shows one sentence. The audit timeline further down the page gets the new row, but nothing ties it to the click.

The click is when the viewer is watching. The panel shows the governance on the record the operator just changed.

## What the panel shows

One panel per outcome, docked at the foot of the record panel where the action bar was. It stays until the next action or navigation. Lines are labelled by what they prove, not by engine stage names, and each carries a value: a role, a rule or a status.

### Action applied

A `analyst` approves a low-risk case:

```
APPROVED · kyc_0014 · pending_review → approved
✓ Permission   analyst is allowed to approve in kyc
✓ Policy       5 rules checked, all passed             [trace]
✓ Recorded     by usr_analyst at 2026-09-25 14:02:11 UTC
✓ Audit        recorded in the audit log                [open]
```

| Line | Source |
|---|---|
| Header | Audit row `before_json` / `after_json`: status |
| Permission | `actor.role` against `action.allowedRoles`. The server checks this in `executeIntent` step 1, so an applied outcome means it passed |
| Policy | `outcome.trace`: rule count and effects. `[trace]` expands the existing `PolicyTrace` component |
| Recorded | Audit row `actor_id` and `ts`. They get their own line because an auditor asks for them first. Plain words throughout; the panel doesn't describe the database |
| Audit | Row fetched by `outcome.auditId`. `[open]` links to `/audit` filtered to the record |

### Action sent for approval

After `REFUND_CLUSTERING_HOLD.md` merges, the linked KYC case still uses the existing approval-request flow:

```
WAITING FOR MANAGER · kyc_0013 · pending_review unchanged
✓ Permission   analyst is allowed to approve in kyc
→ Policy       linked_refund_hold: customer's refunds are held in a merchant cluster [trace]
✓ Held         approval request keeps the input until a decision
✓ Audit        approval_requested                    [open]
```

The policy line names the rule that routed it, with the engine's own reason string. The request can be approved from `/inbox` by a Manager.

### Routed action applied directly

After the clustering hold merges, `rfnd_0011` leaves the Analyst queue and the Manager pays it directly:

```
APPLIED · rfnd_0011 · requested → executing
✓ Permission   manager is allowed to execute in refunds
✓ Policy       clustering_hold: Kestrel Outdoors not-received refunds
               total 1880.00 USD over 14 days          [trace]
✓ Recorded     by usr_manager at 2026-09-25 14:02:11 UTC
✓ Audit        applied                                 [open]
```

The policy line names the rule that routed it, with the engine's own reason string. No approval request is created.

### Action denied

The action bar disables any action the preview already denies, so a denial only arrives when the record changed after the page loaded. Same layout: `✗ Policy` with the denying rule, `✓ Audit #n denied`, and the header "unchanged".

### Duplicate submit

A second submit with the same idempotency key returns the stored result. The panel adds one line, `↺ Duplicate · input already received, nothing written again`. The key itself is not shown.

## Downstream systems

The panel has no downstream line. A line such as "✓ Customer onboarding resumed" would be false: the repo has no outbound call, outbox or event bus, and the only customer state is `kyc_cases.status`. When a real integration is needed, the pattern is a transactional outbox: `apply` writes an event row, such as `customer.approved`, to an `engine_outbox` table in the same transaction, and the panel shows `✓ Event customer.approved queued · outbox #n`. That is an engine change and one Devin run.

## Changes by file

### `packages/engine/src/execute-intent.ts`

`appendAudit` already returns the row id, but the approval and denial branches drop it. Return it as `auditId` on the `pending_approval` and `denied` outcomes, and add the field to `IntentOutcome` in `packages/engine/src/types.ts`. It is additive, but it is under `packages/engine/`, so it goes in its own pull request, apart from the clustering hold, which must leave the engine untouched.

### `apps/console/src/app/actions.ts`

After `executeIntent`, if the outcome carries an `auditId`, read that row with the read client and return `{ seq, ts, actorId, actorRole, before, after }` next to the result. Pass `before` and `after` through `maskRecord`, like every other record read.

### `apps/console/src/components/action-outcome.tsx` (new)

A client component that renders the panel from the result. No tool-specific branches.

### `apps/console/src/components/action-panel.tsx`

Render `ActionOutcome` for applied, pending, denied and replayed results. Keep the toast for engine errors (`version_conflict`, `invalid_input` and the rest), which have no audit row to show.

## Acceptance

```bash
pnpm verify
pnpm db:setup && pnpm dev
```

- As `analyst`, approve a case under the manager line. The panel shows the status change, and `[open]` lands on the row at `/audit`.
- Approve a case at or above 70. The panel reads "WAITING FOR MANAGER", names `risk_tier_approval`, and the audit line shows `approval_requested`.
- Run the same approvals in refunds and flags. The panel has the same shape, and no file under `tools/` changed.
- Submit twice with the same key. The panel shows the replay line and `/audit` gains no row.
- No line renders without a value.
