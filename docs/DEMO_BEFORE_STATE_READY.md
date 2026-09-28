# Demo Before-State - Ready to Record

## Overview

Parts 2 and 3 of the demo were built end to end by real Devin runs, reviewed and merged, then
reverted so the Loom recording can trigger each build live from an unbuilt console. The run
records stay in `runs/` as proof the runs happened. Built changes now land switched off, so the
recording shows a merge by switching it on, not by reverting.

## What Was Implemented

1. **Companies House check, built by Devin** (#61, run `01M3K9026SV0P1KRYKN233M8SC`).
   Requested by `admin` from `kyc_0104` (Thornbury Couriers Ltd). Seven files, 856 lines added:
   a Companies House client, recorded responses, a material row in Declared vs found for
   dissolved, liquidating or late-filing companies, 362 lines of tests, and `.env.example`
   keys. No new rule: `declared_vs_found` does the holding.
2. **Chargebacks first pull request, built by Devin** (#62, run `01M3KA3GEW97JN35NN2J6JX7X8`).
   Requested by `admin` from `/roadmap/chargebacks` with the seven-file Power Apps export.
   Sixteen files: `tools/chargebacks/` (schema, rules, seed of 50 disputes), migration `0009`, a
   registry line, a schema re-export, the lockfile and 212 lines of tests.
3. **Returned to the before-state** (#63). Both changes reverted; `runs/01M3K9026SV0P1KRYKN233M8SC/`
   and `runs/01M3KA3GEW97JN35NN2J6JX7X8/` kept as the frozen record. The Chargebacks tile reads
   **Coming soon** and `kyc_0104` approves straight through again.
4. **Built changes land switched off** (#67).
   - Apps sit behind a feature flag: `app.chargebacks`, seeded off, not customer-facing. A
     built app whose flag is off reads **Switched off** on home and on its roadmap page, is
     hidden from the sidebar; `/t/<tool>` redirects to its roadmap page and any action on it fails
     with "This app is switched off" (#70). Existing databases get the off flag row on server
     start.
   - Checks sit behind a setting: `kyc.companies_house_check`, declared by the KYC tool at 0.
   - The Chargebacks and Companies House requests and checklists now ask for the flag and the
     setting.
5. **Runs plan the tests they move** (#65). The playbook's Plan step lists existing tests that
   pin rule lists, trace order or per-record decisions. This is why both live Kestrel runs had
   stopped at Verify ([DEVIN_RUN_SYNC_FIXES.md](DEVIN_RUN_SYNC_FIXES.md) § 6).
6. **Approval retries re-post the GitHub review** (#64), so a refused review no longer leaves a
   run stuck at **Approved**.

## Current State

```bash
ls tools                                   # automation  flags  kyc  refunds
ls runs                                    # 01M3K9026SV0P1KRYKN233M8SC  01M3KA3GEW97JN35NN2J6JX7X8
sqlite3 apps/console/data/console.db \
  "select value_json from runtime_constants where key = 'kyc.companies_house_check';"   # 0
pnpm verify                                # Test Files 39 passed · Tests 325 passed
```

- ✅ Three live apps: KYC review, Refunds, Feature flags
- ✅ Chargebacks: **Coming soon**, export committed, **Ask Devin to start this app** offered to
  admins
- ✅ `kyc_0104`: approves on its hand-typed registry check, **Ask Devin to add a check** offered
  to KYC managers and admins
- ✅ Kestrel cluster visible on `/t/refunds`, no rule holding it
- ⚠ The org playbook must be re-registered to pick up #65

## Next Steps

### Immediate actions

1. `pnpm devin:playbook`, so sessions get the plan-the-affected-tests step.
2. Run the Devin runs a day ahead, in the order the Loom script sets
   ([LOOM-VIDEO-SCRIPT.md](LOOM-VIDEO-SCRIPT.md) § Before Recording): Kestrel rule, the
   `partial_delivery` pull request, `pnpm db:scenario courier-outage` and switch-off, the undo,
   then Companies House and Chargebacks.
3. After each Devin-built merge, switch it on: `app.chargebacks` on `/t/flags`,
   `kyc.companies_house_check` to 1 on `/admin/policy`.
4. Within the hour before recording: stop `pnpm dev`, `rm -rf apps/console/data && pnpm db:setup`,
   start `pnpm dev`, pick a role again.
5. Delete stray `runs/<id>/` folders left by stopped runs, so the merge sync isn't blocked.

### Optional enhancements

- Turn on branch protection for `cognition-dashboard-devin-integration`
  ([GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) § Branch protection).
- Set a `max_acu_limit` on dispatched sessions; the console sends none today.
- Commit a finished live run's poll recording as `runs/<run_id>/replay.json`, so the run view can
  replay a real run offline.
