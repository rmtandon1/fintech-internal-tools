# Chargebacks From Power Apps

The reviewer's brief for Demo 3. This is an engine-scope run, so Devin's prompt names this file,
and Devin reads only the section marked as sent to Devin (`.devin/run-protocol.playbook.md`
§ Intake). Everything else here is for the reviewer; the checklist is also in the approval dialog.

## Summary

- The disputes team runs chargebacks in a Power App with two Power Automate flows. It's one of
  the seventeen apps waiting on the console's home page.
- An admin asks Devin, from the Chargebacks "Coming soon" page, to rebuild it as a console app
  from its export.
- Devin writes a new tool: its table, seed, actions, a rule for each condition the app and its
  flows enforce, and a count card for the deadline alert. The app inherits roles, approvals,
  settings, masking and the audit log from the engine.
- A new table means a migration and a lockfile change, so it runs in engine scope. The diff
  should still touch nothing under `packages/`.

## Today

`fixtures/power-apps/chargebacks/` is the export:

| Source | What it enforces |
| --- | --- |
| `DisputesScreen.pa.yaml` | Open disputes, soonest deadline first; a red banner counts disputes over $1,000 due within 48 hours |
| `DisputeDetailScreen.pa.yaml` | Every decision needs a note. Accepting a fraud dispute over $500 needs a team lead. Fighting needs evidence uploaded |
| `FightApproval.json` | Fighting a dispute over $2,500 goes to a team lead's approval: first to respond decides |
| `DeadlineAlert.json` | Hourly: closes missed disputes as lost; emails the team lead about open disputes over $1,000 due within 48 hours |
| `Data/disputes.csv` | 50 disputes; three open ones over $1,000 fall due within 48 hours of the export |

## The request (sent to Devin)

Prefilled from `tools/automation/src/specs.ts`, and editable:

> Rebuild the Chargebacks Power App as a console app from the export in
> fixtures/power-apps/chargebacks. Keep its fields and actions, seed it from disputes.csv, and
> turn every condition in its Power Automate flows into a rule, and its deadline alert into a
> count on the queue. The refunds team works it, so use the refunds roles. In the pull request,
> list each flow step next to what replaced it, and flag anything with no equivalent.

## Where it starts

`/roadmap/chargebacks`. **Ask Devin to build this app** shows when the app's export is
committed. An admin can press it; managers see it greyed out. What Devin gets: the export's
file list with line counts. It reads the files themselves from the repository.

## Reviewer checklist

- **The mapping table in the pull request.** One row per condition above, each naming what
  replaced it. Nothing dropped silently.
- **Rules, not screens:**
  - accepting a fraud dispute over $500 needs a refunds manager
  - fighting over $2,500 needs a refunds manager's approval
  - fighting without evidence is denied
  - every decision carries a note
- **The deadline.** Acting on a dispute past its deadline is denied, and a count card shows open
  disputes over $1,000 due within 48 hours.
- **Flagged, not faked.** The hourly job that closes missed disputes and the team-lead email have
  no equivalent in the console. The pull request should say so, not build a mailer.
- **Dates stay live.** The seed keeps each date's offset from the export time (28 September 2026,
  09:00 UTC), so the three due-soon disputes are due soon on the day of the demo.
- **The engine is untouched.** New files under `tools/chargebacks/`, one line in
  `apps/console/src/registry.ts`, a schema re-export, a migration, the package dependency and
  the lockfile. Nothing under `packages/`.
- **Tests:** one per rule above, plus the seed's due-soon count.

## After merge

1. The Chargebacks tile on home moves from Coming soon to Live.
2. The queue's count card reads 3: open disputes over $1,000 due within 48 hours.
3. As refunds agent, accept `DSP-20401` (fraud, $2,480): it waits for a refunds manager.
4. Fight a dispute without evidence: denied, and the trace says why.
5. `/audit` has a row for each action, in the same chain as refunds and KYC.
