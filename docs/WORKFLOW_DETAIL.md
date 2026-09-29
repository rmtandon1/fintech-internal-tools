# Complete Workflow: Converting Cross-Platform

How an app that runs today in Power Apps moves into the console, from the point of view of the
team that uses it. The example is Chargebacks, Part 3 of the demo: a canvas app on a SharePoint
list with two Power Automate flows, exported to `fixtures/power-apps/chargebacks/`.

The reviewer's brief is [CHARGEBACKS_FROM_POWER_APPS.md](CHARGEBACKS_FROM_POWER_APPS.md). The
rule-level version of the same loop is [WORKFLOW_EXPLAINED.md](WORKFLOW_EXPLAINED.md).

---

## Your Questions Answered

### Q1: What moves in the first pull request, and what doesn't?

The first pull request is the start of the move, not the whole app. It brings what the team
needs to work the queue safely, and lists everything else.

| In Power Apps today | Source in the export | First pull request |
|---|---|---|
| Queue of open disputes, soonest deadline first | `Src/DisputesScreen.pa.yaml` | ✅ Moved: the queue with its fields, seeded from the 50 disputes |
| Red banner: disputes over $1,000 due within 48 hours | `Src/DisputesScreen.pa.yaml` | ✅ Moved: a count on the queue |
| Accepting a fraud dispute over $500 needs a team lead | `Src/DisputeDetailScreen.pa.yaml` | ✅ Moved: needs a refunds manager |
| Fighting a dispute over $2,500 needs a team lead's approval | `Workflows/FightApproval.json` | ✅ Moved: needs a refunds manager |
| Every decision needs a note | `Src/DisputeDetailScreen.pa.yaml` | ⚠ Listed as still to do, unless Devin moves it |
| Fighting needs evidence uploaded | `Src/DisputeDetailScreen.pa.yaml` | ❌ Listed as still to do |
| Hourly: close missed disputes as lost | `Workflows/DeadlineAlert.json` | ❌ Listed as still to do |
| Hourly: email the team lead about big disputes due soon | `Workflows/DeadlineAlert.json` | ❌ Listed as still to do (the count replaces the email for now) |
| SharePoint `Disputes` list | `Data/disputes.csv` | ⚠ Snapshot seeded; a live data migration is not part of this step |

### Q2: When does the new app appear for my team?

After an engineer and the engine's owner approve the pull request, Devin merges it, and an
admin or manager switches it on. The app arrives **switched off** behind the feature flag
`app.chargebacks`, so the merge itself changes nothing anyone sees.

| State | Home tile shows | What the system actually has |
|---|---|---|
| Before the request | **Coming soon** | No `tools/chargebacks`, no table |
| Run in progress | **Coming soon** | Code on Devin's branch only |
| Merged, flag off | **Switched off** | The tool, its table and its 50 disputes; `/t/chargebacks` redirects to the roadmap page |
| Flag on | Live tile, opens the queue | Same code, `app.chargebacks` enabled in production |

### Q3: What happens to the Power App in the meantime?

Nothing. It keeps running on its own data until the team decides to stop using it. The console
starts from a snapshot of the SharePoint list, dated 28 September 2026 at 09:00 UTC, with each
deadline kept at its offset from that moment so three disputes are always due soon.

---

## Complete Workflow (Step-by-Step)

### Scenario: Start the Chargebacks move

#### Step 1: Find the app on the roadmap

```
Home → Money movement → Chargebacks (Coming soon) → /roadmap/chargebacks
```

**What happens**

- The page shows what the app will do, which roles will use it, and a sample layout with no
  data.
- Because the app's export is committed, the page offers **Ask Devin to start this app**.

```
┌─ Chargebacks ─────────────────────────── COMING SOON ─┐
│ Accept or fight card disputes before the deadline.    │
│ Refunds agent · Refunds manager                       │
│                          [ Ask Devin to start this app ]│
├───────────────────────────────────────────────────────┤
│ Queue                          Sample layout, no data │
│ Record    Customer    Amount    Status                │
│ ───────   ────────    ──────    ──────                │
└───────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Export in the repository: 7 files under `fixtures/power-apps/chargebacks/`
- ❌ No Chargebacks tool
- ⚠ Only an admin can ask. Managers see the button greyed out, with who can

#### Step 2: Ask Devin to start it

```
Viewing as → admin → /roadmap/chargebacks → Ask Devin to start this app → Send to Devin
```

**What happens**

- The request box starts empty, with a short suggested sentence Tab accepts. The spec sent with
  it asks for the queue, the deadline count and the two riskiest rules; the app behind
  `app.chargebacks`, off; and every formula and flow step listed as done or still to do.
- The context lists the export's files with their line counts. Devin reads the files
  themselves from the repository.
- This request, unlike a rule, sends its brief: the prompt names
  `docs/CHARGEBACKS_FROM_POWER_APPS.md`, and Devin reads only the section marked as sent to it.

```
┌─ Devin · New app ──────────────────────────────────────┐
│ REQUEST                                                │
│ Start moving the Chargebacks Power App into the        │
│ console, from the export in fixtures/power-apps/…      │
│                                                        │
│ CONTEXT                                                │
│ Data/disputes.csv                      52 lines        │
│ Src/DisputeDetailScreen.pa.yaml        48 lines        │
│ Workflows/FightApproval.json           77 lines        │
│ … 4 more files                                         │
│                                                        │
│ GUARDRAILS                                             │
│ tools/chargebacks · registry · schema · drizzle ·      │
│ lockfile · flags seed · tests                          │
│                                      [ Send to Devin ] │
└────────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Request recorded on `/runs` as **Sent to Devin**
- ✅ `dispatch` audit row written
- ❌ Nothing built yet

#### Step 3: Devin builds the first pull request

```
/runs → the Chargebacks run
```

**What happens**

- Devin commits its plan first, then adds `tools/chargebacks/` (schema, rules, seed), one line
  in the registry, a schema re-export, a migration, the lockfile and one flag row.
- The pull request carries the done / still-to-do list for every formula and flow step.
- CI runs Lint, Typecheck, Boundaries and Test, and the guard checks the diff against the plan.

**Current state**

- ✅ Pull request open with its list
- ⚠ It adds a table, so the engine's owner reviews it as well as an engineer
- ❌ Not in the console yet

#### Step 4: Approve and merge

```
Viewing as → engineer → the run → Review and approve → Approve as engineer
```

**What happens**

- The engineer checks the pull request against the checklist: the list, two rules not all,
  the count, live dates, refunds roles, nothing under `packages/`, the flag.
- CODEOWNERS adds the engine owner for `apps/console/drizzle/`.
- Devin merges. The console pulls the merge and runs the new migration.

```
┌─ Approve pull request ──────────────────────────────┐
│ tools/chargebacks · registry · migration · flag row │
│ CI checks  4 of 4 passed ✅                         │
│ Context    unchanged ✅                             │
│ Checklist  7 of 7 ticked ✅                         │
│ ⚠ Shared code: apps/console/drizzle/ (engine owner) │
│                  [ Cancel ]  [ Approve as engineer ]│
└─────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Merged, pulled, migrated
- ✅ Home tile reads **Switched off**
- ❌ The team can't open it yet, by design

#### Step 5: Switch it on

```
Viewing as → admin (or a manager) → Feature flags → app.chargebacks → Enable
```

**What happens**

- The flag isn't customer-facing, so a manager or admin enables it straight away. The change
  writes an audit row.
- The tile turns live, and the sidebar shows Chargebacks.

**Current state**

- ✅ App live for refunds roles
- ✅ Switching the flag off hides it again, without touching the code

#### Step 6: Work the queue

```
Viewing as → refunds_agent → Chargebacks → DSP-20401 → Accept
```

**What happens**

```
┌─ Chargebacks ─────────────────────────────── 50 disputes ┐
│ ⚠ 3 due within 48 hours (over $1,000)                   │
├─────────────────────────────────────────────────────────┤
│ DSP-20401   fraud    $2,480   open   due …               │
│ …                                                       │
└─────────────────────────────────────────────────────────┘

 Accept DSP-20401 → Waiting for refunds manager
 ⚠ fraud accept over $500 needs a refunds manager
```

**Current state**

- ✅ The two riskiest rules enforced by the engine, with the audit log
- ✅ Roles, approvals, masking and settings inherited, with no new engine code
- ⚠ The rest of the move is the pull request's list, one small request per line

---

## Key Insights

Merged is not the same as switched on.

| What you see | What it means |
|---|---|
| **Coming soon** | Nothing is built. The page is a preview |
| **Devin working** on `/runs` | The app exists on a branch only |
| **Switched off** | The app is built, merged and in the database, but hidden |
| Live tile | `app.chargebacks` is on. The team can use it |

**A merged app changes nothing until someone switches it on, and switching it off hides it
again without a revert.**

- Before the flag is on: the tile reads Switched off, and `/t/chargebacks` redirects to its roadmap page.
- After the flag is on: the queue, its count and its rules work for refunds roles.
- Before the merge: the Power App is the only place disputes are worked.
- After the merge: the console has the snapshot and the rules; the Power App still runs until
  the team retires it.

---

## Visual Timeline

```
 T0                 ┌──────────────────────────────┐   registry: kyc, refunds, flags, automation
 Before             │ Home: Chargebacks            │   tables: no disputes table
                    │ COMING SOON                  │   flags: no app.chargebacks row
                    └──────────────┬───────────────┘
                                   ↓  admin: Ask Devin to start this app → Send to Devin
 T0 + 1 min         ┌──────────────────────────────┐   devin_runs.status = running
 Requested          │ /runs: Devin working         │   runs/<id>/context.json: 7 export files
                    │ Home: COMING SOON            │   audit: dispatch, record_session
                    └──────────────┬───────────────┘
                                   ↓  Devin: plan → tools/chargebacks → PR with the list
 T0 + run           ┌──────────────────────────────┐   PR: 16 files, one migration
 In review          │ /runs: PR #n                 │   CODEOWNERS: engine owner requested
                    │ Home: COMING SOON            │   audit: record_pr
                    └──────────────┬───────────────┘
                                   ↓  engineer + engine owner approve; Devin merges
 T0 + review        ┌──────────────────────────────┐   git HEAD: <merge commit>
 Merged, off        │ Home: Chargebacks            │   migration applied; 50 disputes seeded
                    │ SWITCHED OFF                 │   flags: app.chargebacks = off
                    └──────────────┬───────────────┘
                                   ↓  admin: Feature flags → app.chargebacks → Enable
 Later              ┌──────────────────────────────┐   flags: app.chargebacks = on
 Live               │ Chargebacks queue, 3 due     │   audit: flag enabled
                    │ soon; fraud accept > $500    │
                    │ waits for a manager          │
                    └──────────────────────────────┘
```

---

## Important Notes

### 1. Where state is stored

Whether an app is live is decided from two facts: its tool is registered in code, and, when the
mode names a flag, that flag is on.

```ts
// apps/console/src/lib/modes.ts
export function modeIsLive(mode: OpsMode, flagsOn: Set<string>): boolean {
  return getTool(mode.id) !== undefined && (!mode.flag || flagsOn.has(mode.flag));
}
```

The flag set is read from the flags tool on each request:

```ts
// tools/flags/src/index.ts
export function enabledFlagKeys(): Set<string> {
  const rows = db
    .select({ key: featureFlags.key })
    .from(featureFlags)
    .where(and(eq(featureFlags.enabled, 1), eq(featureFlags.environment, "production")))
    .all();
  return new Set(rows.map((row) => row.key));
}
```

The disputes live in the console's SQLite database after the migration. The export itself stays
in git under `fixtures/power-apps/chargebacks/`, and the request Devin worked from stays in
`runs/<run_id>/context.json`.

### 2. Why it's built this way

- ✅ A merge can be shown on camera, or to a team, by switching on, not by reverting.
- ✅ The new app inherits roles, approvals, settings, masking and the audit log from the engine.
- ✅ The engine owner sees every change that adds a table.
- ✅ Nothing from the Power App is dropped without someone deciding it: it's either moved or
  on the list.

### 3. Current limitations, and how to check by hand

- ⚠ The data is a snapshot. Moving the live SharePoint list is a separate step.
- ⚠ Hourly jobs (auto-close, the team-lead email) don't exist yet; the count stands in for the
  email.
- ⚠ Evidence upload for fights is not moved.
- ⚠ A production build needs `pnpm build` and a restart after the merge.

Check by hand:

```bash
ls tools/chargebacks/src 2>/dev/null || echo "not built yet"
sqlite3 apps/console/data/console.db "select key, enabled, environment from feature_flags where key = 'app.chargebacks';"
sqlite3 apps/console/data/console.db ".tables" | tr -s ' ' '\n' | grep -i dispute || echo "no disputes table"
```

### 4. Optional future enhancements

- 🔗 The auto-close and deadline email as scheduled jobs in the console.
- 🔗 Evidence upload on fights.
- 🔗 A live sync from the SharePoint list until the Power App is retired.

---

## Summary

- ✅ **What moves first?** The queue, the 48-hour count and the two riskiest rules. The rest is a
  list in the pull request.
- ✅ **When does my team see it?** After approval, merge and someone switching `app.chargebacks`
  on.
- ✅ **What about the Power App?** It keeps running until the team retires it.

---

## Dependencies

```bash
pnpm install
pnpm db:setup
cp .env.example .env    # DEVIN_API_KEY and GITHUB_TOKEN
pnpm devin:playbook
pnpm dev
```

The export must be committed under `fixtures/power-apps/chargebacks/` for the button to show.

---

## Next Steps

1. As `admin`, open `/roadmap/chargebacks`. The badge reads **Coming soon**.
2. Press **Ask Devin to start this app**, then **Send to Devin**.
3. On `/runs`, wait for the pull request. Open it on GitHub and read the done / still-to-do
   list.
4. Confirm CODEOWNERS requested the engine owner for `apps/console/drizzle/`.
5. As `engineer`, **Review and approve**, then **Approve as engineer**.
6. On home, the tile reads **Switched off**. `/t/chargebacks` redirects to `/roadmap/chargebacks`.
7. As `admin`, enable `app.chargebacks` on `/t/flags`. The tile goes live.
8. The queue count reads 3.
9. As `refunds_agent`, accept `DSP-20401`. It waits for a refunds manager.
10. Disable `app.chargebacks`. The tile reads **Switched off** again.

Want the first item on Devin's still-to-do list next? Asking for the hourly auto-close as a
scheduled job is the natural second pull request.
