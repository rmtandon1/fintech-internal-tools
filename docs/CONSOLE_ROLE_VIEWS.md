# Console Role Views

Reference for what each role can see in the console today. This describes shipped behaviour, not a layout design; the layout itself is being revisited and no document prescribes it.

## Linked activity on a KYC case

A KYC record shows the same customer's refunds in a drawer (`linkedActivity` on `tools/kyc/src/index.ts`, rendered by `apps/console/src/components/context-drawer.tsx`). Analyst and Manager work both KYC and refunds queues; reveal permissions for masked data are a separate capability.

| Element | Analyst | Manager | Admin |
|---|---|---|---|
| Refund count, total, reason codes, held marker | Yes | Yes | Yes |
| Refund rows: amount, email, card number | Masked | Masked, reveal logged | Masked, reveal logged |
| Open cluster in Refunds | Yes | Yes | Yes |
| Pay or reject a routed refund | Hidden | Yes, directly | Hidden |

Run controls start where the evidence is: "Ask Devin for a rule" in the refunds cluster drawer for a manager, "Ask Devin to monitor merchants" in the KYC pattern monitor's drawer for a manager or admin, "Ask Devin to start this app" on the Chargebacks Coming soon page (`AGENT_TRIGGER_SURFACE.md`), "Ask Devin to change this rule" on `/admin/policy`, and "Undo this change" on `/runs` for an admin on a merged run. Routed refunds are paid or rejected directly by a Manager; the KYC approval-request flow remains unchanged. Their placement on a KYC case, and per-role visibility, is open for the UI rework.

The join is KYC `email` = refunds `customerEmail`, run on the server with the read client so no unmasked email reaches the browser. Covered by `apps/console/tests/tools/kyc-linked-activity.test.ts`.

## Devin window controls

Devin's work opens in a centred modal (`apps/console/src/components/agent-window.tsx`, on `@console/ui/dialog`), not a column. The header's Devin button or `]` toggles it (`[` toggles the sidebar); Esc or the close button also closes it. There is no resizable pane and no persisted layout; the same window opens at every viewport width.

The window also opens on its own when a handoff or a run is focused — the "Ask Devin" buttons and `/runs` row clicks set the workspace focus. It shows the handoff panel, the run view for a focused or in-flight run (polling `GET /api/devin/<id>`), or a server-rendered empty state naming the last merged run with a link to `/runs`. Its header marks a missing `DEVIN_API_KEY` with a `Not connected` chip and names the data source: `context preview` for a handoff, the run view for a focused run, or `devin_runs` otherwise; without a key the empty state just says Devin is not connected.
