# App Removal & Restoration Workflow

How to take a live app out of the console, back to **Coming soon**, and how to bring it back.
The worked example is **Chargebacks**, merged in `1681273` (#62, run `01M3KA3GEW97JN35NN2J6JX7X8`).
The Loom script's Part 3 needs Chargebacks on its Coming soon page before Devin builds it, so this
is the reset you run before recording and the rebuild you run on camera.

The same steps work for any app that was added as one tool package plus a registry line.

---

## The Complete Architecture

An app lives in three layers. Each one changes at a different time, for a different reason, and
most mistakes come from assuming one layer follows another.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  UI STATE                     what a person sees in the browser              │
│                                                                              │
│  • Home tile: Live, or Coming soon          ← allModes() in lib/modes.ts     │
│  • /t/chargebacks queue, or 404             ← getTool() in the queue page    │
│  • /roadmap/chargebacks preview, or 404     ← getTool() in the roadmap page  │
│  • "Ask Devin to start this app" button     ← isLive() in run-triggers.ts    │
│  • The "Viewing as" role                    ← signed cookie                  │
│                                                                              │
│  Persistence: none of its own. Worked out on every request from the two      │
│  layers below. The role cookie is the one stored value; a database reset     │
│  invalidates it.                                                             │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ reads
┌───────────────────────────────────▼──────────────────────────────────────────┐
│  RUNTIME STATE                apps/console/data/console.db (SQLite)          │
│                                                                              │
│  • chargeback_disputes      the 50 seeded disputes and their status          │
│  • __drizzle_migrations     which migrations this file has applied           │
│  • policy constants         chargebacks.fraud_accept_approval_usd_minor,     │
│                             chargebacks.fight_approval_usd_minor             │
│  • approvals, audit rows    anything done in the queue                       │
│  • devin_runs               the run that built the app, status "merged"      │
│  • data/replays/<run>.json  the run's recorded frames                        │
│                                                                              │
│  Persistence: survives server restarts, git pulls and reverts. Migrations    │
│  only move forward: removing code never drops a table. Only a reset          │
│  (rm -rf apps/console/data) clears it. Gitignored, local to one machine.     │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ created by migrate + seed from
┌───────────────────────────────────▼──────────────────────────────────────────┐
│  SOURCE CODE                  git, branch cognition-dashboard-devin-integration│
│                                                                              │
│  • tools/chargebacks/**                 the tool: fields, actions, rules,    │
│                                         seed, schema                         │
│  • apps/console/src/registry.ts         import + one line in TOOLS           │
│  • apps/console/src/schema.ts           one re-export for migrations         │
│  • apps/console/drizzle/0009_*.sql      CREATE TABLE chargeback_disputes     │
│    + meta/_journal.json entry                                                │
│  • apps/console/package.json            "@console/tool-chargebacks" dep      │
│  • pnpm-lock.yaml, tests                                                     │
│                                                                              │
│  Never touched by either workflow:                                           │
│  • apps/console/src/lib/modes.ts        the OPS_MODES catalog entry          │
│  • fixtures/power-apps/chargebacks/**   the Power Apps export (Devin's input)│
│  • tools/automation/src/specs.ts        CHARGEBACKS_FROM_POWER_APPS prompt   │
│                                                                              │
│  Persistence: permanent and shared. Every change is a commit; the merged     │
│  PR and a tag are the backup.                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Removal Workflow (Complete)

Goal: Chargebacks shows as **Coming soon**, `/roadmap/chargebacks` offers **Ask Devin to start
this app**, and nothing about the built app is left in code or data.

### Step 1: Tag the built app

Before anything moves, give the commit that added the app a name, so it can be restored in one
command and linked from the Loom description.

```bash
git fetch origin
git tag app/chargebacks-built 1681273
git push origin app/chargebacks-built
```

**Result after this step:**
- ✅ Backup exists: `app/chargebacks-built` points at the built app, locally and on GitHub
- ❌ Source code: unchanged, Chargebacks still registered
- ❌ Runtime state: unchanged, 50 disputes and a merged run in `devin_runs`
- ❌ UI state: unchanged, tile still Live

### Step 2: Revert the app on a branch and open a pull request

`git revert` removes exactly what #62 added, and nothing else. Check the file list first.

```bash
git show --stat 1681273                      # what #62 added
git switch -c remove-chargebacks origin/cognition-dashboard-devin-integration
git revert --no-edit 1681273
pnpm install                                  # drops the workspace link, updates the lockfile
pnpm verify                                   # lint, typecheck, boundaries, run guard, tests
git push -u origin remove-chargebacks
gh pr create --base cognition-dashboard-devin-integration \
  --title "Take Chargebacks back to Coming soon" \
  --body "Reverts #62 so the Loom script can rebuild it. Restore with the app/chargebacks-built tag."
```

The part of the revert that changes behaviour is two lines in the registry:

```ts
// apps/console/src/registry.ts
import { automationTool } from "@console/tool-automation";
-import { chargebackTool } from "@console/tool-chargebacks";
import { flagTool } from "@console/tool-flags";
...
export const TOOLS: ToolDeclaration[] = [
  kycTool,
  refundTool,
-  chargebackTool,
  flagTool,
  automationTool,
];
```

If the revert conflicts, later work touched the same lines (most often `registry.ts` or the
lockfile). Keep the later work and remove only the Chargebacks lines, the same rule the in-console
undo gives Devin.

**Result after this step:**
- ✅ Source code on the branch: Chargebacks gone, `pnpm verify` green
- ✅ Pull request open against the integration branch
- ❌ Source code on the integration branch and in the main checkout: still has Chargebacks
- ❌ Runtime state: unchanged
- ❌ UI state: unchanged

### Step 3: Merge and pull into the main checkout

```bash
gh pr merge remove-chargebacks --squash --delete-branch
cd ~/buy-v-build-cog-demo                     # the main checkout
git switch cognition-dashboard-devin-integration
git pull --ff-only
pnpm install
```

With `pnpm dev` running, the registry change reaches the page on the next request. Every screen
that asks whether Chargebacks is live gets `undefined` back:

```ts
// apps/console/src/lib/modes.ts, allModes()
const decl = getTool(mode.id);            // undefined for "chargebacks" now
const live = decl !== undefined;          // false
href: live ? `/t/${mode.id}` : `/roadmap/${mode.id}`,   // → /roadmap/chargebacks

// apps/console/src/app/t/[tool]/page.tsx
if (!decl) notFound();                    // /t/chargebacks is a 404

// apps/console/src/app/roadmap/[mode]/page.tsx
if (!mode || getTool(id)) notFound();     // the preview renders again
```

The **Ask Devin to start this app** button does not come back yet. It reads the database, not
the code:

```ts
// apps/console/src/lib/run-triggers.ts
function isLive(spec: RunnableSpec): boolean {
  const merged = listRuns({ limit: 200 }).find(
    (run) => run.spec === spec.file && run.status === "merged",
  );
  return merged !== undefined && merged.operation === "change";   // still true
}
```

**Result after this step:**
- ✅ Source code: Chargebacks gone from the integration branch and the main checkout
- ✅ UI state: home tile says Coming soon; `/t/chargebacks` is a 404; `/roadmap/chargebacks` renders
- ❌ UI state: no **Ask Devin to start this app** button, because `devin_runs` still says the change merged
- ❌ Runtime state: `chargeback_disputes` still holds 50 rows; the 0009 migration is still recorded; constants, approvals and audit rows still name `chargebacks`

### Step 4: Reset the runtime state

Stop `pnpm dev` first. A server left running keeps reading the deleted file until restart.

```bash
# Ctrl-C the dev server, then:
rm -rf apps/console/data && pnpm db:setup
```

`db:setup` is `db:migrate` then `db:seed`. The migrator now finds migrations 0000 to 0008 only,
so `chargeback_disputes` is never created. The seed walks `TOOLS`, which no longer lists the app:

```ts
// apps/console/scripts/seed.ts
for (const tool of TOOLS) {
  if (tool.constants?.length) registerConstants(tool.constants);
  tool.seed?.();
}
```

Resetting also matters for the restore. The migrator applies a migration only when its journal
`when` is later than the newest row in `__drizzle_migrations` (the same check as
`migrationsPending()` in `lib/bridge.ts`). An old database has already recorded 0009 and still
holds the table. A Devin rebuild writes a new 0009 with a later `when`, and its `CREATE TABLE
chargeback_disputes` fails on that database because the table already exists.

**Result after this step:**
- ✅ Runtime state: no `chargeback_disputes`, no chargebacks constants, no approvals or audit rows for it
- ✅ Runtime state: `devin_runs` is empty, so `isLive()` returns false
- ✅ Source code: unchanged since Step 3
- ❌ UI state: the dev server is stopped, and the role cookie was signed with the old secret

### Step 5: Restart, pick a role, check the screens

```bash
pnpm dev
git status --short     # nothing; delete any stray runs/<id>/ folder from a stopped run
```

In the browser, choose a role again from **Viewing as**, because the reset regenerated the secret
that signs the cookie. Then, as **Admin**, open `/roadmap/chargebacks`.

**Result after this step:**
- ✅ UI state: home tile Coming soon, `/roadmap/chargebacks` shows the seven inherited controls and **Ask Devin to start this app**
- ✅ Runtime state: clean, seeded from the three remaining apps
- ✅ Source code: no Chargebacks; the export in `fixtures/power-apps/chargebacks/` is still there
- ✅ Backup: `app/chargebacks-built` still points at the built app

> **Alternative: the in-console undo.** As Admin, `/runs` → the merged Chargebacks run →
> **Undo this change** → **Ask Devin to undo it**. Devin writes the removal and an engineer
> approves it, so Steps 2 and 3 take a run's time instead of a minute. Because the undo is itself a
> merged run, `isLive()` turns false without a reset. Run Step 4 anyway: it clears the disputes
> table and the recorded migration.

---

## Restoration Workflow (Complete)

Two ways back. **Rebuild with Devin** is what the Loom script shows. **Restore from the tag** is
for when you need the app back and don't need to watch it being built.

### Step 1: Check the preconditions

```bash
curl -s localhost:3001/api/devin/status       # mode "live"
pnpm devin:playbook                            # only if .devin/run-protocol.playbook.md changed
ls fixtures/power-apps/chargebacks             # the export Devin reads
grep -c chargeback apps/console/src/registry.ts   # 0
```

`.env` needs `DEVIN_API_KEY` for the run and `GITHUB_TOKEN` for **Review and approve**.

**Result after this step:**
- ✅ Devin connected, playbook current, export present
- ❌ Source code: no Chargebacks
- ❌ Runtime state: no Chargebacks
- ❌ UI state: Coming soon

### Step 2: Ask Devin from the Coming soon page

As **Admin**, open `/roadmap/chargebacks`, click **Ask Devin to start this app**, read **What Devin
will see** (the seven export files) and click **Send to Devin**.

The button exists because three things hold at once:

```ts
// apps/console/src/lib/run-triggers.ts, modeTriggers()
if (modeId !== CHARGEBACKS_FROM_POWER_APPS.tool) return [];      // the spec targets this mode
const files = listExport(bridgeDeps().repoRoot, modeId);
if (files.length === 0) return [];                                 // the export is committed
// trigger(): if (isLive(spec)) return null;                       // no merged change in devin_runs
```

Sending writes a `devin_runs` row (`dispatched`), and the run's allowed paths come from the spec:
`tools/chargebacks/**`, the registry, schema, modes file, `package.json`, drizzle, the lockfile,
tests and `runs/<run_id>/**`.

**Result after this step:**
- ✅ Runtime state: a `devin_runs` row for `CHARGEBACKS_FROM_POWER_APPS.md`
- ✅ UI state: the run shows in `/runs`; the Ask Devin button is gone while it is in flight
- ❌ Source code: nothing yet, Devin is still reading the export
- ❌ UI state: tile still Coming soon

### Step 3: Wait for the pull request

A Chargebacks run takes 30 to 60 minutes. Watch it until it opens its pull request, and answer at
once if it stops to ask. A run nobody answers is suspended for inactivity.

```bash
gh pr list --base cognition-dashboard-devin-integration --state open --search "Chargebacks"
```

Note the run's **Took …** time, ACUs and test total as it finishes. The script reads them off
screen.

**Result after this step:**
- ✅ Source code on Devin's branch: `tools/chargebacks/`, one registry line, one schema line, one migration, the lockfile, tests
- ✅ Pull request open, with the list of every formula and flow step marked done or still to do
- ❌ Source code on the integration branch: no Chargebacks
- ❌ Runtime state: no table
- ❌ UI state: Coming soon

### Step 4: Review, approve, merge

Switch to **Engineer**, open the run, click **Review and approve**, check the acceptance list and
click **Approve as engineer**. The dialog posts the GitHub review, Devin merges, and the console
pulls the merge into the main checkout. Then it migrates:

```ts
// apps/console/src/lib/bridge.ts
migrate: async (cwd) => {
  await execFileAsync("pnpm", ["db:migrate"], { cwd });
  registerToolConstants();     // the new chargebacks.* limits, without a re-seed
},
```

Migration creates `chargeback_disputes`. Nothing seeds it: `db:migrate` never calls a tool's
`seed()`.

**Result after this step:**
- ✅ Source code: Chargebacks on the integration branch and in the main checkout
- ✅ Runtime state: `chargeback_disputes` exists; the run is `merged` in `devin_runs`
- ✅ UI state: home tile Live; `/t/chargebacks` renders; the roadmap page is a 404
- ❌ Runtime state: the table is empty, so the queue shows no disputes and no "due within 48 hours" count

### Step 5: Link the package and seed

```bash
pnpm install     # links the new @console/tool-chargebacks workspace package
pnpm db:seed
```

`seedDisputes()` is idempotent and dates each dispute from now, so three disputes over $1,000 fall
due within 48 hours whenever it runs. The seed also resets the other apps' demo records, the same
way the script's retakes do. If the queue page errors with `Module not found:
'@console/tool-chargebacks'`, the install ran after the server started: restart `pnpm dev`.

**Result after this step:**
- ✅ Runtime state: 50 disputes, 3 due within 48 hours, both limits registered
- ✅ Source code: unchanged since Step 4
- ✅ UI state: queue populated

### Step 6: Check it as the refunds team

As **Refunds agent**, open `/t/chargebacks`. The count reads 3 due within 48 hours. On `DSP-20401`,
the $2,480 fraud dispute, click **Accept**: it goes to a manager, and the trace names
`fraud_accept_approval`.

**Result after this step:**
- ✅ UI state: Live, populated, rules enforced
- ✅ Runtime state: one pending approval and its audit row
- ✅ Source code: the new merge, with its pull request as the record

### Fast path: restore from the tag

When nobody needs to watch it being built, bring back the exact code that was removed:

```bash
git switch -c restore-chargebacks origin/cognition-dashboard-devin-integration
git revert --no-edit <sha of the "Take Chargebacks back to Coming soon" merge>
# or, if the revert conflicts with later work:
#   git checkout app/chargebacks-built -- tools/chargebacks apps/console/drizzle
#   then add the registry, schema and package.json lines back by hand
pnpm install && pnpm verify
git push -u origin restore-chargebacks && gh pr create --fill
gh pr merge restore-chargebacks --squash --delete-branch
git -C ~/buy-v-build-cog-demo pull --ff-only
pnpm db:migrate && pnpm db:seed
```

This skips the Devin run, so `devin_runs` has no Chargebacks row. That is harmless: the tile is
Live because the registry lists the tool, and the roadmap page that would show the button is a 404.

---

## The Key Insight

**The catalog never changes. Only the registry does.**

The console keeps two separate lists. `OPS_MODES` in `lib/modes.ts` is a static catalog of every
app the console will ever have: twenty entries, each with a name, icon, roles and the sample
columns for its Coming soon page. `TOOLS` in `registry.ts` lists only the apps that are built.

```ts
// apps/console/src/lib/modes.ts: the catalog entry stays through removal and restoration
{
  id: "chargebacks",
  name: "Chargebacks",
  description: "Accept or fight card disputes before the deadline.",
  icon: "Gavel",
  roles: rolesFor("refunds", "agent"),
  actions: ["accept", "fight"],
  area: "Money movement",
  columns: ["Dispute", "Merchant", "Reason", "Amount", "Deadline"],
  ...
}

// apps/console/src/registry.ts: the only list that removal and restoration edit
export const TOOLS: ToolDeclaration[] = [kycTool, refundTool, chargebackTool, flagTool, automationTool];
export function getTool(name: string) { return TOOLS.find((t) => t.name === name); }
```

Every screen joins the two by `id`:

```ts
// apps/console/src/lib/modes.ts
export function allModes(): ModeEntry[] {
  return OPS_MODES.map((mode) => {
    const decl = getTool(mode.id);
    const live = decl !== undefined;
    return {
      ...mode,
      name: decl?.displayName ?? mode.name,          // the built tool's own words win
      description: decl?.description ?? mode.description,
      live,
      href: live ? (mode.href ?? `/t/${mode.id}`) : `/roadmap/${mode.id}`,
    };
  });
}
```

**Why filtering works.** Live or Coming soon is not stored anywhere. It is worked out on each
request from whether `getTool(id)` finds something. Take the tool out of `TOOLS` and the same
catalog entry falls through to its Coming soon form: the tile, the sidebar, the roadmap preview
and the sample columns all come from data that was there before the app was built. Put it back
and the tool's declaration takes over again. Neither direction edits the catalog, a route or a
component.

**Why it's safe.**

- **One place to change.** `registry.ts` says "nothing else in the app enumerates tools." The
  seed, the constant registration, the queue page, the roadmap page and the home page all read
  `TOOLS`, so none of them can disagree about whether the app exists.
- **The engine never names a tool.** `pnpm check:boundaries` enforces it, so removing
  `tools/chargebacks/` cannot break `packages/engine`. The revert touches no file under `packages/`.
- **Mutually exclusive routes.** `/t/chargebacks` 404s without a registered tool and
  `/roadmap/chargebacks` 404s with one, so a stale link can never show both states.
- **Devin's input stays put.** The export and the spec live outside the tool's folder, so removing
  the app never removes what Devin needs to rebuild it.
- **The trade-off is the database.** Code decides whether the app is live; the database keeps
  whatever the app wrote. That is why removal ends with a reset, and why the Ask Devin button, which
  reads `devin_runs`, is the one screen that can disagree with the code.

---

## Backup/State Storage Strategy

Two things could be backed up: the code, or the database.

### Option 1: Keep the code, regenerate the data

Tag the commit that added the app and push the tag. Rebuild the database from migrations and seed
whenever it's needed.

- ✅ Exact: the tag is the bytes that were reviewed and merged, with their pull request
- ✅ Shared: the tag is on GitHub, so any checkout can restore it
- ✅ One command to restore, by reverting the removal or checking files out of the tag
- ✅ Seeded data is always fresh: `seedDisputes()` dates everything from now
- ❌ Loses what people did in the app: approvals, audit rows, statuses changed in the queue
- ❌ Restoring old code onto a branch that has moved on can conflict, most often in `registry.ts` or `pnpm-lock.yaml`
- ❌ Doesn't bring back the Devin run: `/runs` won't show how the app was built

### Option 2: Copy the database file

Copy `apps/console/data/console.db` (and `data/replays/`) aside before removal, and copy it back to
restore.

- ✅ Keeps everything: disputes as they were, approvals, audit rows, the run in `/runs`
- ✅ Instant, with no migration or seed step
- ❌ Local only: `apps/console/data/` is gitignored, so the copy lives on one machine
- ❌ Goes stale: seeded dates count from seed time, so a copy made days earlier shows disputes overdue and no "due within 48 hours" count
- ❌ Has to match the code: a database with migration 0009 recorded, put back next to code whose migration has a different `when`, fails on `CREATE TABLE` or skips a migration it needs
- ❌ Carries the old cookie secret, so every role has to be chosen again anyway

### Recommended

Back up code with a tag (Option 1). Treat the database as disposable. Keep the one piece of runtime
state worth keeping, the run's replay, by committing it next to the run.

```bash
# Before removal: name the built app
git tag app/chargebacks-built 1681273 && git push origin app/chargebacks-built

# After a recorded rebuild: keep the run's replay with the code
RUN=<run_id from /runs>
mkdir -p runs/$RUN && cp apps/console/data/replays/$RUN.json runs/$RUN/replay.json
git add runs/$RUN/replay.json && git commit -m "Keep the replay of Chargebacks run $RUN"
git tag loom-2026-09-28 && git push origin HEAD loom-2026-09-28

# Any time the data is wrong: throw it away and rebuild it
rm -rf apps/console/data && pnpm db:setup
```

Don't move the `demo-start` tag.

---

## How to Test

Each test checks one layer on its own, so a failure says which layer is behind. Run them after
removal, and again after restoration. Expected values are given as *removed → restored*.

### Test 1: Source code, registry

```bash
wc -l apps/console/src/registry.ts            # 29 → 31 (import + TOOLS entry)
grep -c chargeback apps/console/src/registry.ts   # 0 → 2
grep -c tool-chargebacks apps/console/src/schema.ts apps/console/package.json   # 0 → 1 each
```

### Test 2: Source code, package and migration

```bash
test -d tools/chargebacks && echo present || echo absent          # absent → present
grep -c chargeback apps/console/drizzle/meta/_journal.json          # 0 → 1
ls apps/console/drizzle/*.sql | wc -l                               # 9 → 10
```

### Test 3: Source code, what must never move

```bash
grep -c '"chargebacks"' apps/console/src/lib/modes.ts               # 1 → 1 (catalog entry)
ls fixtures/power-apps/chargebacks | wc -l                           # same before and after
git diff app/chargebacks-built -- packages/ | wc -l                  # 0 unless the engine changed for another reason
```

### Test 4: Pull requests

```bash
gh pr list --base cognition-dashboard-devin-integration --state all --search "Chargebacks" \
  --json number,title,state,mergedAt
# removal: "Take Chargebacks back to Coming soon" MERGED
# restore: Devin's Chargebacks pull request MERGED, newer than the removal
git ls-remote --tags origin app/chargebacks-built                    # one line, both times
```

### Test 5: Runtime state, database

```bash
DB=apps/console/data/console.db
sqlite3 $DB "SELECT count(*) FROM sqlite_master WHERE name='chargeback_disputes';"   # 0 → 1
sqlite3 $DB "SELECT count(*) FROM chargeback_disputes;"          # error: no such table → 50
sqlite3 $DB "SELECT count(*) FROM __drizzle_migrations;"          # 9 → 10
sqlite3 $DB "SELECT spec, operation, status FROM devin_runs;"     # empty → CHARGEBACKS_FROM_POWER_APPS.md|change|merged
```

### Test 6: UI state, routes

With `pnpm dev` running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/t/chargebacks          # 404 → 200
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/roadmap/chargebacks    # 200 → 404
```

### Test 7: UI state, by eye

- Home: Chargebacks under **Coming soon** → under the live apps.
- Removed, as **Admin**: `/roadmap/chargebacks` shows **Ask Devin to start this app**. If the page
  renders without the button, `devin_runs` still holds the old merged run: redo removal Step 4.
- Restored, as **Refunds agent**: `/t/chargebacks` shows 3 due within 48 hours, and **Accept** on
  `DSP-20401` goes to a manager.

### Test 8: The whole build

```bash
pnpm verify      # green both times; the test total drops on removal and rises on restore
```

---

## Visual Summary

### Removal

```
   Chargebacks LIVE
   code ✅   data ✅   screens ✅
          │
          │  Step 1: git tag app/chargebacks-built 1681273         INSTANT
          ▼
   Backup on GitHub; nothing else moved
          │
          │  Step 2: git revert on a branch, pnpm verify,          USER ACTION REQUIRED
          │          gh pr create                                   ~5 MINUTES (verify)
          ▼
   Pull request open; integration branch unchanged
          │
          │  Step 3: gh pr merge, git pull --ff-only,              USER ACTION REQUIRED
          │          pnpm install                                   ~1 MINUTE
          ▼
   Registry has no chargebacks
          │
          │  dev server picks up registry.ts                        INSTANT (next request)
          ▼
   Tile: Coming soon · /t/chargebacks: 404 · /roadmap/chargebacks: 200
   ⚠ No Ask Devin button: devin_runs still says "merged"
   ⚠ chargeback_disputes still holds 50 rows
          │
          │  Step 4: stop pnpm dev,                                USER ACTION REQUIRED
          │          rm -rf apps/console/data && pnpm db:setup      ~30 SECONDS
          ▼
   Fresh database: 0000–0008 applied, three apps seeded, devin_runs empty
          │
          │  Step 5: pnpm dev, pick a role in "Viewing as"         USER ACTION REQUIRED
          ▼
   Chargebacks COMING SOON
   code ❌   data ❌   screens: Coming soon + "Ask Devin to start this app"
```

### Restoration (rebuild with Devin)

```
   Chargebacks COMING SOON
   code ❌   data ❌   screens: Coming soon + Ask Devin button
          │
          │  Step 1: /api/devin/status is live, export present     INSTANT
          ▼
          │  Step 2: Admin → Ask Devin to start this app →         USER ACTION REQUIRED
          │          Send to Devin
          ▼
   devin_runs row "dispatched"; run visible in /runs; button hidden
          │
          │  Step 3: Devin reads the export, plans, builds,        30–60 MINUTES
          │          runs pnpm verify, opens the pull request       (answer at once if it asks)
          ▼
   Pull request open on Devin's branch
          │
          │  Step 4: Engineer → Review and approve →               USER ACTION REQUIRED
          │          Approve as engineer
          │
          │  GitHub review → Devin merges → console pulls →        ~1 MINUTE
          │  pnpm db:migrate → constants registered
          ▼
   Tile: Live · /t/chargebacks: 200 · table exists, 0 rows
          │
          │  Step 5: pnpm install && pnpm db:seed                  USER ACTION REQUIRED
          │          (restart pnpm dev if the module isn't found)   INSTANT
          ▼
   50 disputes · 3 due within 48 hours · both limits live
          │
          │  Step 6: Refunds agent → DSP-20401 → Accept            USER ACTION REQUIRED
          ▼
   Chargebacks LIVE
   code ✅   data ✅   screens ✅   DSP-20401 waiting for a manager

   Fast path instead of Steps 2–4: revert the removal from the
   app/chargebacks-built tag, merge, pull, pnpm db:migrate        ~5 MINUTES, USER ACTION REQUIRED
```

---

## Summary

- **Source code manages whether the app exists.** One line in `TOOLS` makes Chargebacks live; the
  tag and the merged pull requests are the record of every change.
- **Runtime state manages what the app has done.** Disputes, limits, approvals, audit rows and the
  run that built it live in `console.db`, move only forward, and are cleared only by a reset.
- **UI state manages nothing of its own.** Every screen is worked out on each request by joining
  the static `OPS_MODES` catalog to the registry, plus `devin_runs` for the Ask Devin button.

Why the design works:

- ✅ Removal and restoration edit one list, `TOOLS`; the catalog, routes and components never change
- ✅ The Coming soon page is built from data that exists before the app does, so removal always has somewhere to land
- ✅ `/t/<id>` and `/roadmap/<id>` can't both render, so no screen shows a half-removed app
- ✅ The engine never names a tool, so taking one out can't break the write path
- ✅ Devin's input, the Power Apps export and the spec, sits outside the tool's folder and survives removal
- ✅ The database is disposable: migrate and seed rebuild it, with dates fresh for the day
- ✅ Each layer has its own test, so when something looks wrong you know which layer to fix
