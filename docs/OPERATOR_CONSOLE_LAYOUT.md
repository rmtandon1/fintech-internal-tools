# Operator Console Layout

## Summary

- The console's frame. Operations sit on the left: queues, records, flags. Devin's work sits on the right: the run, its phases, the pull request.
- One frame carries the argument: the operator asks, Devin changes the code, and the next refund behaves differently.
- Context from another tool, such as a KYC case's refunds, opens in a drawer at the foot of the record, filtered by the viewer's role.
- Every panel names its data source. The Devin window reads the live session while a run is in flight, and the default branch after merge.
- Dense and keyboard-first, through styling alone. Normal feature work, and `AGENTS.md` applies.

## Why the split layout

Governed operations and code changes share one audit trail, and a split layout is the one that puts both in a single frame. A tiled telemetry grid would need simulated tiles, because there are no microservices to emit telemetry. A node map of the three tools is mostly empty canvas, and a fuller one would draw roadmap modes that are still stubs.

The console shows its own telemetry, because that is real: audit chain length and verify status (already in the header), pending approvals by tier, rule hits in the last 24 hours (from `decision_json` in `audit_log`), and runs in flight.

## Wireframe

An admin on a KYC case after the clustering hold has merged. The linked-activity drawer is open, and the run that added the rule is shown as history.

```
┌ OPS CONSOLE ────────────────────────────────── chain ✓ 231 · approvals 3 · admin ▾ ┐
│ KYC  REFUNDS  FLAGS  INBOX  AUDIT  RUNS                            / search  g k   │
├──────────────────────────────────────────────┬─────────────────────────────────────┤
│ KYC · kyc_0013 · pending_review · v1         │ DEVIN                               │
│ ─────────────────────────────────────────    │ run 01K5Z3Q8 · IMPLEMENTATION/ADD.. │
│ Risk score  68   (manager line 70)           │ Hold clustered not_received refunds │
│ Country     GB   Sanctions  clear            │ ✓ intake      base 1a67f60          │
│ Docs        complete                         │ ✓ baseline    verify ✓  68 tests    │
│ Email       o••••@example.com    [reveal]    │ ✓ plan        5 files               │
│                                              │ ✓ edit        5 of 5 in plan        │
│ POLICY TRACE                                 │ ✓ verify      verify ✓  76 tests    │
│  allow    documents_complete                 │ ✓ PR          #14 merged            │
│  allow    no_sanctions_hit                   │               [diff] [session]      │
│  allow    risk_tier_approval   68 < 70       │                                     │
│  approval linked_refund_hold   manager       │ [Reverse this change]  admin only   │
│                                              │                                     │
│ [Approve → manager]  [Request info] [Reject] │                                     │
├──────────────────────────────────────────────┤                                     │
│ ▸ LINKED ACTIVITY (same customer)       [×]  │                                     │
│   Refunds 1 · $475 · not_received · held ⚑   │                                     │
│   Cluster  Kestrel Outdoors · 4 · $1,880     │                                     │
│   Card     ••4242                            │                                     │
│   [Open cluster in Refunds →]                │                                     │
└──────────────────────────────────────────────┴─────────────────────────────────────┘
```

What each role sees in the linked-activity drawer on a KYC case. Roles are domain-scoped (`packages/permissions/src/roles.ts`), and KYC roles can't open the refunds tool (`visibleTo: rolesFor("refunds", "agent")`). So KYC roles see the aggregate, which carries no PII and explains why approval now needs a manager, and only admin sees the refund rows. The wireframe is drawn as admin.

| Element | KYC reviewer | KYC manager | Admin |
|---|---|---|---|
| Refund count, total, reason codes, held marker | Yes | Yes | Yes |
| Refund rows: amount, email, card number | Hidden | Hidden | Masked, reveal logged |
| Open cluster in Refunds | Hidden | Hidden | Yes |
| Approve a held refund | Hidden | Hidden (a refunds decision) | Yes, unless they requested it (maker ≠ checker) |
| Ask Devin / Reverse this change | Hidden | Ask only | Both |

The join is KYC `email` = refunds `customerEmail`. It runs on the server with the read client, so no unmasked email reaches the browser.

## Opening and closing the Devin window

Devin's work shows in a centred modal window (`apps/console/src/components/agent-window.tsx`, on `@console/ui/dialog`), not a column beside `main`. The header's Devin button or `]` opens it; Esc, the close button, or `]` closes it. It is not a resizable pane, and there is no layout to persist: the same window opens at every viewport width.

## Where the Devin window's data comes from

The run view has to work while a run is in flight, when Devin's branch is the only place `runs/<run_id>/` exists. So the window reads the session while the run is live, and the default branch after it has merged.

| State | Source | Shown |
|---|---|---|
| Run in flight | `devin_runs` row plus the session's `status`, `status_detail` and `structured_output`, through `apps/console/src/app/api/devin/` | Phases, facts as they arrive, reply box, stop |
| Run merged | `devin_runs` row plus `runs/<run_id>/` on the default branch | Final phases, PR, merge commit, Reverse button |
| No runs | Nothing | "No runs yet" |

The panel never pretends to analyse code itself. It shows what the run reported.

## Changes by file

### `apps/console/src/app/layout.tsx`

`main` takes the full width; the Devin window mounts through the header:

```tsx
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader agent={<AgentWindow />} /* … */ />
              <main className="min-h-0 flex-1 overflow-hidden p-3">{children}</main>
            </div>
```

### `apps/console/src/components/agent-window.tsx` (new)

Client shell on `@console/ui/dialog` that picks the state from the table above. It holds the handoff panel and the run view described in `AGENT_TRIGGER_SURFACE.md`. The in-flight view is a client child that polls `apps/console/src/app/api/devin/` every few seconds and stops polling when the run ends.

### `apps/console/src/components/context-drawer.tsx` (new)

A client shell on `ui/sheet.tsx`, docked to the bottom of the record column rather than covering it. Its content is resolved on the server and passed in.

### `apps/console/src/app/t/[tool]/[id]/page.tsx`

For KYC records, query refunds where `customerEmail` equals the case's `email`, pass rows through `maskRecord`, and render them in the context drawer. Keep the lookup in `tools/kyc/` as a declared `linkedActivity`, following the `clusters` pattern in `TRANSACTION_INSPECTION.md`, so the page stays generic.

### `apps/console/src/app/globals.css`

Density pass: 13px base, `font-variant-numeric: tabular-nums` on amounts and ids, 28px table rows, monospace for ids, hashes and rule names. No new component library.

## Acceptance

```bash
pnpm verify
pnpm db:setup && pnpm dev
```

- As analyst, drawer rows are masked with no reveal control, and approve is absent.
- As manager, reveal works and writes an audit row.
- With no runs, the window shows its empty state and nothing breaks.
- At phone width the window still opens as a centred modal and the record stays usable.
