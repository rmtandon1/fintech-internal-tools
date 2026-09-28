# Chargebacks From Power Apps

The reviewer's brief for Part 3 of the demo. This spec is sent with the run, so Devin's prompt names this file,
and Devin reads only the section marked as sent to Devin (`.devin/run-protocol.playbook.md`
§ Intake). Everything else here is for the reviewer; the checklist is also in the approval dialog.

## Summary

- The disputes team runs chargebacks in a Power App with two Power Automate flows. It's one of
  the seventeen apps waiting on the console's home page.
- An admin asks Devin, from the Chargebacks "Coming soon" page, to start the move from the
  app's export. This is the first pull request of a migration, not the finished app.
- It brings the queue with its fields and the 50 disputes, the deadline alert as a count on the
  queue, and the two riskiest rules. Every other formula and flow step is listed as still to do.
  The app inherits roles, approvals, settings, masking and the audit log from the engine.
- A new table means a migration and a lockfile change, so `apps/console/drizzle/**` is in its
  allowed paths. The diff should still touch nothing under `packages/`.

## What "started" means, and what it doesn't

- **It is:** a live queue with real disputes, the 48-hour count, manager approval for fraud accepts
  over $500 and fights over $2,500, and a done / still-to-do list covering the whole export.
- **It isn't:** every rule, evidence upload, the hourly auto-close, the team-lead email, a
  SharePoint data migration, user acceptance testing or production readiness.
- **On camera:** the run's real time is shown, cut to about 90 seconds. The claim is "the first
  pull request of the migration, with the rest as a list of small requests", never "Devin built
  the app".

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

> Start moving the Chargebacks Power App into the console, from the export in
> fixtures/power-apps/chargebacks. This is the first pull request, not the whole app: the queue with
> its fields, seeded from disputes.csv; the deadline alert as a count on the queue; and the two
> riskiest rules, fraud accepts over $500 and fights over $2,500, each needing a refunds manager.
> Use the refunds roles. In the pull request, list every formula and flow step as done or still
> to do. Put the app behind the feature flag `app.chargebacks` in Feature flags, off by default
> and not customer-facing, so an admin turns it on from the console after the merge.

## Where it starts

`/roadmap/chargebacks`. **Ask Devin to start this app** shows when the app's export is
committed. An admin can press it; managers see it greyed out. What Devin gets: the export's
file list with line counts. It reads the files themselves from the repository.

## Reviewer checklist

- **The list in the pull request.** Every formula and flow step from the export, each marked done
  in this pull request or still to do. Nothing dropped without being listed.
- **Two rules, not all of them:** accepting a fraud dispute over $500 needs a refunds manager;
  fighting one over $2,500 needs a refunds manager's approval.
- **The deadline alert as a count** on the queue: open disputes over $1,000 due within 48 hours.
- **Dates stay live.** The seed keeps each date's offset from the export time (28 September 2026,
  09:00 UTC), so three disputes are due soon on the day of the demo.
- **The refunds roles work it**, with nothing new in the role catalog.
- **The engine is untouched.** New files under `tools/chargebacks/`, one line in
  `apps/console/src/registry.ts`, a schema re-export, a migration, the package dependency, the
  lockfile and one seeded flag row in `tools/flags/src/seed.ts`. Nothing under `packages/`.
- **Behind a flag.** The app sits behind the `app.chargebacks` feature flag: one seeded row in
  `tools/flags/src/seed.ts`, off, not customer-facing, and the mode's `flag` set; the tile reads
  Switched off until an admin turns it on.
- **Tests:** the two rules, the count and the seed.

## After merge

1. The Chargebacks tile on home moves from Coming soon to Switched off.
2. An admin turns `app.chargebacks` on in Feature flags: the tile goes Live.
3. The queue's count reads 3: open disputes over $1,000 due within 48 hours.
4. As refunds agent, accept `DSP-20401` (fraud, $2,480): it waits for a refunds manager.
5. Turning the flag off puts the tile back to Switched off. The pull request's list is the rest
   of the migration, one small request per line.
