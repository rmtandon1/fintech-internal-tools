# Queue Stats Strip

## Summary

- Role-specific counts at the top of each tool queue, to direct the person opening it to what they need to focus on next.
- Each count links to exactly the rows it counts. Every number is a query.
- Analysts see what to work on next, managers see what is breaching or needs their decision.
- Switching role changes the numbers, which shows the role model without a line of copy.
- Stats are declared on the tool, like filters, so a new tool gets a strip without touching the page or the engine. 

## Problem

Currently the queue panel title shows one number, the total row count (`apps/console/src/app/t/[tool]/page.tsx`). Home's Work panel shows each tool's open count and one attention marker (`apps/console/src/lib/work.ts`), the same for every role that can see the tool. Neither tells an analyst what to pick up or a manager what is about to breach.

Roles are flat across domains (`packages/permissions/src/roles.ts`). Analysts work the refunds and KYC queues; Managers decide both queues. Admins see the control-plane view, and engineers review Devin pull requests rather than working tool queues.

| Role | First question | What that means in this code |
|---|---|---|
| Analyst | What do I work on next? | Volume, risk, and deadlines in the rows they can act on |
| Manager | What needs my decision, and where is the team at risk of breaching SLA? | Queue routing, `dueAt`, escalations, approvals they can decide |
| Admin | Are the controls holding? | Policy denials and setting changes |

The strip is also a visible role check. Switch role and the numbers change, because each role's job is different. That is the governance model shown without a sentence of copy.

## What each role sees

The tables show each role's configured stats, capped at three per tool. KYC admins see two audit stats because they do not work the queue.

### KYC

| Role | Stats | Source |
|---|---|---|
| Analyst | Pending review · High risk pending · Due in 12h | `status`, `riskTier`, `due` |
| Manager | Overdue · Escalated · Need your approval | `due`, `status`, approvals the actor can decide |
| Admin | Blocked in the last day · Setting changes this week | `audit_log.event` = `denied` / `constant_changed` |

### Refunds

| Role | Stats | Source |
|---|---|---|
| Analyst | Ready to send · With a manager · Failed | `status`, `queue` |
| Manager | Need your approval · Failed · With processor | `queue`, `status` |
| Admin | With a manager · Blocked in the last day · Setting changes this week | `queue`, `audit_log` |

Over-limit refunds leave the Analyst queue and appear in the Manager queue, where the Manager pays or rejects them directly. They do not create approval requests. In the courier-outage reversal, the Manager's "Need your approval" count reads 60 because it links to the manager queue.

### Flags

| Role | Stats | Source |
|---|---|---|
| Manager | Partial in production · Expired, still serving · Need your approval | `environment`, `status`, `expiresAt < now`, approvals |
| Admin | Need your approval · Blocked in the last day · Setting changes this week | approvals, `audit_log` |

Flags has no domain, so it is visible to `MANAGER_ROLES` and admin only. Neither agent sees it, so there is no agent row.

"Expired, still serving" is a flag past `expiresAt` whose status is `on` or `partial`: flag debt. The current seed already has one.

Admins own policy settings (`/admin/policy`), the audit chain, undo and app switches. There is no admin approval tier for refunds or KYC; permission-flag changes remain an admin decision.

## Wireframe

KYC queue as Manager. The total and the row are from the seed; the stat counts are illustrative.

```
┌ KYC REVIEW QUEUE ─────────────────────────────────────── 100 cases ┐
│  ⚠ 6 Overdue      11 Escalated      3 Need your approval            │
├────────────────────────────────────────────────────────────────────┤
│ Status ▾ │ Risk tier ▾ │ Due ▾ │ Search                 [Apply]    │
├────────────────────────────────────────────────────────────────────┤
│ kyc_0011  Harbour Point Capital  US  68  medium  escalated overdue │
│ kyc_0007  ...                                                      │
└────────────────────────────────────────────────────────────────────┘
```

Clicking "6 Overdue" loads `/t/kyc?due=overdue`: exactly six rows.

## Rules

1. **Every number is a query.** No stat is simulated. If the code cannot count it, it is not on the strip.
2. **Click = count.** A records stat is a set of the tool's own filters. Its count is `decl.list({ filters }).total` and its link is the queue with those filters. The number and the rows it opens cannot disagree.
3. **Counts respect the role, not masking.** The strip shows counts, never PII, so no masking is involved. Stats a role can't act on are simply not declared for it.
4. **Zero is shown.** "0 Overdue" is information. Only a stat with a warning tone and a non-zero value is highlighted.
5. **Engine stays tool-agnostic.** Stat types and the approval and audit counters live in the engine and name no tool. Everything KYC-, refund- or flag-specific stays in `tools/`.

## Changes by file

### `packages/engine/src/types.ts`

Add `StatDecl` and an optional `stats?: StatDecl[]` on `ToolDeclaration`:

```ts
export interface StatDecl {
  key: string;
  label: string;
  roles: Role[];
  tone?: "neutral" | "warning";
  source:
    | { kind: "records"; filters: Record<string, string> }
    | { kind: "approvals"; scope: "decidable" | "requested_by_me" }
    | { kind: "audit"; event: "denied" | "constant_changed"; sinceHours: number };
}
```

### `packages/engine/src/approvals.ts`

Give `countPendingFor` an optional `tool` argument. Add `countRequestedBy(actor, tool)` for pending approvals the actor requested. Both are read-only.

### `packages/engine/src/audit/query.ts`

Add `since` to `AuditFilters` so a stat and the audit page it links to use the same window.

### `tools/kyc/src/index.ts`

Declare the KYC stats. Add a `due` filter with `overdue` (`dueAt < now`) and `due_12h` (`now ≤ dueAt < now + 12h`) options, applied in `list`, so the SLA stats have rows to link to.

### `tools/refunds/src/index.ts`, `tools/flags/src/index.ts`

Declare their stats. Flags gets an `expired` filter (`expiresAt < now` and status `on` or `partial`).

### `apps/console/src/components/stat-strip.tsx` (new)

Server component. Takes the declaration and the actor, keeps the stats whose `roles` include the actor's role, resolves each count, and renders a row of links. Records stats link to `/t/<tool>?<filters>`, approvals stats to `/inbox`, audit stats to `/audit?tool=<tool>&event=<event>&since=<hours>`.

### `apps/console/src/app/t/[tool]/page.tsx`

Render `<StatStrip>` between the header and the filter form. Keep the total row count in the header.

### `apps/console/src/app/inbox/page.tsx`, `apps/console/src/app/audit/page.tsx`

Accept `tool` (inbox) and `since` (audit) query params so the strip's links land on the matching rows.

## Acceptance

```bash
pnpm verify
pnpm db:setup && pnpm dev
```

- Stats match the role-specific tables above (KYC admins see two audit stats; other listed roles see three).
- For every records stat, the count equals the row total of the page it links to.
- As Analyst, a refund routed above the manager line leaves the Analyst queue and appears in the Manager queue. As Manager, pay or reject it directly; no approval request is created. The records-stat count must equal the linked queue's total.
- As admin, change a threshold in `/admin/policy`: "Policy changes 7d" goes up by one on that tool.
- `pnpm check:boundaries` passes: no tool name in `packages/engine`.
- A tool with no `stats` declared renders no strip and nothing breaks.
- At phone width the strip wraps and stays readable.

Tests: engine tests for the two approval counters and the audit `since` filter; tool tests that each declared records stat returns the same total as `list` with its filters.

## Demo note

`dueAt` is set at seed time (`openedAt + 48h` in `tools/kyc/src/seed.ts`), so SLA counts drift as the database ages. A database seeded a few days earlier reads nearly every open case as overdue. Run `pnpm db:setup` shortly before recording.

## On camera

The strip earns its seconds inside two existing moments of the demo:

- **Role switch.** Analyst to Manager on the same KYC queue: the strip changes from "what do I pick up" to "what is breaching or needs my decision". One cut, and the viewer sees that roles are enforced, not decorative.
- **Courier-outage reversal.** The Manager opens refunds and "Need your approval" reads 60 before any row is read. The problem is visible in five seconds, which is the setup for "Reverse this change".

Off camera it strengthens the repo: stats are one more thing a tool declares, and the `flags` receipt ("added no engine code") holds for them too.
