# Transaction Inspection

## Summary

- The refunds queue gains a strip that shows patterns across rows: `Kestrel Outdoors · 4 not_received · $1,880 · 14d`.
- Clicking it opens a drawer over the queue with the refunds behind the total and the rules that allowed each one.
- The drawer is read-only. It shows the pattern and the rules that allowed each row, so a manager can see what no rule catches.
- It replaces the analyst's Excel pivot and one-at-a-time email lookups.
- Clusters are declared on the tool, so a new cluster type is a declaration. Normal feature work by a build agent.

## The problem

`/t/refunds` is a table with filters and sorting. It shows one refund at a time, and the problem is a pattern across several: four `not_received` refunds from one merchant, each under the $500 manager line, $1,880 together.

| Cluster | What it reveals | What the operator does |
|---|---|---|
| Merchant × `not_received`, within the window | Refunds stacked just under the manager line | Sees that no rule catches the pattern, and can ask for one |

One cluster type is enough for now. `ClusterDecl` is generic, so adding another later is a declaration. Refunds are the transaction stream in this repo.

## Why a drawer

The inspection exists to act on the queue beside it. A drawer keeps the list visible and dimmed behind the cluster. That gives a view a full page can't: the pattern and the queue on screen together. The drawer is addressable by URL (`/t/refunds?inspect=merchant_not_received:Kestrel%20Outdoors`), so a link in Slack or in a Devin PR opens the same view.

## Operator flow

1. `/t/refunds` shows a strip above the table: `Kestrel Outdoors · 4 not_received · $1,880 · 14d`.
2. Clicking it opens the drawer. The drawer shows the group total, the rows behind it (PII masked per role), and the rules that ran on each row, all of which allowed it.
3. Until a rule exists, the drawer reads: "No rule catches this today."

RBAC: every role can open clusters, because aggregates carry no PII. Row emails and card numbers go through `maskRecord`. KYC roles can't open `/t/refunds` at all (`visibleTo` is `rolesFor("refunds", "agent")`).

## Changes by file

### `packages/engine/src/types.ts`

Add an optional, generic `clusters` field to `ToolDeclaration`. It names no tool, so `pnpm check:boundaries` still passes.

```ts
  seed?: () => void;
  /** Named groupings an operator can open from the queue and act on. */
  clusters?: ClusterDecl[];
}

export interface ClusterGroup {
  key: string;
  label: string;
  count: number;
  totalUsdMinor: number;
  recordIds: string[];
}

export interface ClusterDecl {
  id: string;
  label: string;
  groups: () => ClusterGroup[];
  /** The action whose policy trace each drawer row shows, e.g. "execute". */
  traceAction?: string;
}
```

### `tools/refunds/src/clusters.ts` (new)

One read-only function, `notReceivedByMerchant()`. It filters to `reasonCode = 'not_received'`, groups by `merchant`, and keeps groups where every row is below `refunds.manager_approval_usd_minor` and the sum is at or above it. It reads the window from `refunds.clustering_window_days`, and falls back to 14 days when the constant is missing or ≤ 0. The constant at 0 switches the hold off (`REFUND_CLUSTERING_HOLD.md` § KILL_SWITCH); it does not switch the inspection off, so the strip keeps showing the pattern while nothing is held. It reads only, through `@console/db`.

After the hold merges, the cluster still shows, but each row now carries its held status. The strip is how the operator sees the rule working.

### `tools/refunds/src/index.ts`

Declare the cluster:

```ts
  clusters: [
    {
      id: "merchant_not_received",
      label: "Stacked under the manager line",
      groups: () => notReceivedByMerchant(),
      traceAction: "execute",
    },
  ],
```

### `tools/refunds/src/seed.ts` and `tools/kyc/src/seed.ts`

- Refunds: append four `not_received` Kestrel Outdoors refunds of 48,000 / 47,500 / 46,000 / 46,500 USD minor, within the last four days, as `rfnd_0011`–`rfnd_0014`. Don't use reason code `goodwill`: `goodwill_approval` already holds those from $50, which would make the story false.
- KYC: append `kyc_0013`, `pending_review`, risk score 68, documents complete, no sanctions hit. Its email matches the customer on `rfnd_0012`. This is the case the KYC half of the rule catches.

### `apps/console/src/components/cluster-drawer.tsx` (new)

Client component on `@console/ui/sheet`. It opens when the `inspect` search param is present and closes by removing it. It renders rows, totals and each row's policy trace with the existing `PolicyTrace` component. The trace shown per row is the one for the action named by the cluster's `traceAction` (`execute` for refunds); a cluster without `traceAction` shows rows and totals only. The handoff button opens the panel described in `AGENT_TRIGGER_SURFACE.md`.

### `apps/console/src/app/t/[tool]/page.tsx`

Above the table, when `decl.clusters?.length`, render one chip per non-empty group, linking to `?inspect=<clusterId>:<groupKey>`. Resolve the open group on the server and pass masked rows to `ClusterDrawer`. Tools without clusters render as they do today.

### `apps/console/tests/tools/refunds-clusters.test.ts` (new)

- The seeded Kestrel refunds form one `merchant_not_received` group totalling 188,000.
- A merchant whose single refund is over the manager line is excluded, because `amount_approval` already covers it.
- Aggregates contain no PII fields.

## Constraints

- Nothing under `packages/engine/` names a tool.
- The drawer never writes directly. Every button is an intent.
- Existing `refunds.test.ts` and `kyc.test.ts` expectations on earlier ids still pass, because new seed rows only append.

## Acceptance

```bash
pnpm verify
pnpm db:setup && pnpm dev   # open /t/refunds; the chip is visible; the drawer opens from it
```

- The cluster appears on a fresh `pnpm db:setup`.
- As `refunds_agent`, drawer rows show masked email and card.
- `/t/kyc` and `/t/flags` render unchanged.
