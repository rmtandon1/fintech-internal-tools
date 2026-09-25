# Console Role Views

Reference for what each role can see in the console today. This describes shipped behaviour, not a layout design; the layout itself is being revisited and no document prescribes it.

## Linked activity on a KYC case

A KYC record shows the same customer's refunds in a drawer (`linkedActivity` on `tools/kyc/src/index.ts`, rendered by `apps/console/src/components/context-drawer.tsx`). Roles are domain-scoped (`packages/permissions/src/roles.ts`) and KYC roles cannot open the refunds tool, so they get the aggregate only and admin gets the rows.

| Element | KYC reviewer | KYC manager | Admin |
|---|---|---|---|
| Refund count, total, reason codes, held marker | Yes | Yes | Yes |
| Refund rows: amount, email, card number | Hidden | Hidden | Masked, reveal logged |
| Open cluster in Refunds | Hidden | Hidden | Yes |
| Approve a held refund | Hidden | Hidden (a refunds decision) | Yes, unless they requested it (maker ≠ checker) |
| Ask Devin / Reverse this change | Hidden | Ask only | Both |

The join is KYC `email` = refunds `customerEmail`, run on the server with the read client so no unmasked email reaches the browser. Covered by `apps/console/tests/tools/kyc-linked-activity.test.ts`.

## Agent column controls

Implemented in `apps/console/src/components/workspace.tsx` on `packages/ui/src/resizable.tsx` (`react-resizable-panels`).

- Minimum width 280px; dragging below it collapses the column.
- `]` toggles the column (`[` toggles the sidebar); the header's Devin button does the same.
- Double-click on the seam restores the default split.
- The split is saved in the `console-workspace-layout` cookie (`apps/console/src/lib/workspace-layout.ts`) so the server renders the last layout without a jump.
- Below `lg` the seam is hidden and the header button opens the column as a sheet.

The column's data source is described in `AGENT_TRIGGER_SURFACE.md` (the run view): the live session while a run is in flight, `runs/<run_id>/` on the default branch after merge.
