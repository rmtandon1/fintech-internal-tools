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

The only run control in the console today is "Ask Devin for a rule" in the refunds cluster drawer (`apps/console/src/components/dispatch-control.tsx`); there is no Reverse control yet. Their placement on a KYC case, and per-role visibility, is open for the UI rework.

The join is KYC `email` = refunds `customerEmail`, run on the server with the read client so no unmasked email reaches the browser. Covered by `apps/console/tests/tools/kyc-linked-activity.test.ts`.

## Devin window controls

Devin's work opens in a centred modal (`apps/console/src/components/agent-window.tsx`, on `@console/ui/dialog`), not a column. The header's Devin button or `]` toggles it (`[` toggles the sidebar); Esc or the close button also closes it. There is no resizable pane and no persisted layout; the same window opens at every viewport width.

The window is a shell: it renders "source: none" and "No runs yet". The planned data flow (live session while a run is in flight, `runs/<run_id>/` on the default branch after merge) is specified in `AGENT_TRIGGER_SURFACE.md` and is not wired up.
