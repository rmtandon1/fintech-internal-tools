# Merged, but Not Live: the Post-Merge Freshness Bug

Troubleshooting write-up for the one challenge the Loom script names: a pull request merged on
GitHub while the console kept serving the code from before the merge. Found and fixed on
28 September 2026, across the Chargebacks merge (#62) and the two fixes it exposed (#70, #72).
All fixes are on `cognition-dashboard-devin-integration`.

## Why this was predictable

The console doesn't deploy from GitHub. `pnpm dev` serves the local checkout, and Devin's pull
requests merge into the same branch on GitHub. A merge changes the remote; the running console
reads four local things that each lag it:

| What the console reads | What moves it | What goes stale without it |
|---|---|---|
| Source files at the checkout's `HEAD` | `git pull` | The old rule still runs |
| `node_modules` | `pnpm install` | A new workspace package doesn't resolve |
| SQLite schema and settings | `pnpm db:migrate`, then registering constants and flags | A new table, setting or app flag is missing |
| The rendered page | Server revalidation | The run shows Merged over the old screen |

Any stack with a build step and a live database has this gap between "merged" and "running". In
a pnpm workspace whose apps add packages, migrations and flags, one merge can hit all four at once.

## Symptom

The run view read **Merged**. The pull request on GitHub read merged. The console still showed
the behaviour from before the change. After a manual `git pull`, the Chargebacks merge went
further and failed instead: `@console/tool-chargebacks` didn't resolve, and on a database seeded
before the app existed, `app.chargebacks` had no flag row for an admin to enable.

## Diagnosis

Walk down from GitHub to the checkout, one layer at a time. Each command answers one question.

| # | Question | Command | What it showed |
|---|---|---|---|
| 1 | Did the console record the merge? | Open `/runs`, or the run view | **Merged**, with a merge commit. Detection worked; the fault was downstream |
| 2 | Is the merge commit in the served checkout? | `git merge-base --is-ancestor <merge-commit> HEAD && echo on-head` | Nothing printed. The checkout had never pulled it |
| 3 | Can the checkout pull cleanly? | `git branch --show-current`; `git status --porcelain` | On the branch, but stray `runs/<id>/` folders from stopped runs made the tree dirty |
| 4 | Do installed packages match the lockfile? | `cmp pnpm-lock.yaml node_modules/.pnpm/lock.yaml` | They differed after the Chargebacks pull: the lockfile had moved, the install hadn't |
| 5 | Is the database at the latest migration? | Compare the last entry in `apps/console/drizzle/meta/_journal.json` with `SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1` | Behind until `pnpm db:migrate` ran |
| 6 | Does the new app have its flag? | **Feature flags** (`/t/flags`) as Admin | No `app.chargebacks` row on a database seeded before #62 |

Conclusion: no single cache was wrong. "Merged" was being treated as "running", and four
separate pieces of local state each needed their own step after the pull.

## The fix: four layers

Each layer closes one row of the table above, and each one fails loudly rather than leaving a
half-updated checkout. The pull is `syncMergedRun` in `tools/automation/src/bridge.ts`; the
install, migrate and register hooks are wired in `apps/console/src/lib/bridge.ts`.

| Layer | Closes | Where |
|---|---|---|
| 1. Know it merged | Run reads **Merged**, nothing pulled | `record_merge` on GitHub's word, `reconcileRuns`, `isSynced` |
| 2. Pull only what's safe | Source at `HEAD` behind the merge | `syncMergedRun`: sync branch, clean tree, `--ff-only`, merge commit on `HEAD` |
| 3. Install what changed | A new workspace package doesn't resolve | `pnpm install --frozen-lockfile`, `installPending` |
| 4. Migrate, register, re-render | Missing table, setting or app flag; stale page | `pnpm db:migrate`, `registerToolConstants`, `ensureModeFlags`, `revalidatePath` |

### Layer 1 · Know it merged

- GitHub is the source of truth for merge state. The console records `record_merge` only once
  GitHub reports the pull request merged, with its merge commit.
- **Sync with GitHub** on `/runs` (`reconcileRuns`) re-reads every approved run's pull request,
  records each merge once, and pulls for the newest.
- A merged run offers **Pull merged code** to engineers until `isSynced` holds: the merge commit
  is on `HEAD` and no migration is pending.

### Layer 2 · Pull only what's safe to pull

- Syncs are serialised, so two clicks never run two pulls.
- The checkout must be on `cognition-dashboard-devin-integration`; a detached `HEAD` or another
  branch is skipped with a reason.
- Any uncommitted change is skipped, so local edits are never clobbered. The one exception is a
  merged run's untracked `runs/<id>/context.json` whose bytes match the dispatched digest: it's
  removed so the pull can land the committed copy.
- `git pull --ff-only`, then a check that the merge commit is on `HEAD`. A pull that doesn't
  contain the merge fails rather than reporting success.

### Layer 3 · Install what changed (#72)

- If the pull changed `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml`, the sync runs
  `pnpm install --frozen-lockfile` before anything else.
- If `node_modules/.pnpm/lock.yaml` still lags `pnpm-lock.yaml` (a failed or skipped earlier
  install), the next sync installs even when the pull brought nothing new.
- `--frozen-lockfile` means the install never rewrites the lockfile, so the tree stays clean for
  the next pull.

### Layer 4 · Migrate, register, re-render (#70)

- If `_journal.json` is ahead of `__drizzle_migrations`, the sync runs `pnpm db:migrate`. Never
  `db:setup` or `db:seed`, which would re-seed the live database.
- After migrating, in the running process: `registerToolConstants()` adds new tools' settings,
  and `ensureModeFlags()` adds an off flag row for any newly registered app. No restart, no
  re-seed.
- `revalidatePath("/", "layout")`, with the root layout `force-dynamic`, so the next request
  renders from the updated checkout and database. The page reloads on a `synced` outcome.

The toast reports which layers ran: `pulled 1a2b3c4 → 5d6e7f8 · dependencies installed · db migrated`.
A skipped or failed sync says why: `pull skipped: working tree has uncommitted changes`.

### What it deliberately doesn't do

- **Turn the app on.** A new app merges with its flag off; an admin enables it in
  **Feature flags** (`/t/flags`). Merged isn't on, by design.
- **Restart or rebuild.** `pnpm dev` picks up new files on the next request. Under a production
  build the toast adds `rebuild required`.

## Troubleshooting

| Toast or symptom | Cause | Fix |
|---|---|---|
| No **Pull merged code** button, and the run isn't **Merged** | The merge hasn't been recorded | **Sync with GitHub** on `/runs` |
| `pull skipped: checkout is not on cognition-dashboard-devin-integration` | Detached `HEAD`, often after checking out a tag | `git checkout -B cognition-dashboard-devin-integration <tag>` |
| `pull skipped: working tree has uncommitted changes` | Local edits, or stray `runs/<id>/` folders from stopped runs | Commit or remove them, then click again |
| `pull failed: … is not on HEAD after the pull` | The remote branch doesn't contain the merge commit | Check `SYNC_REMOTE` and `SYNC_BRANCH`, then `git fetch` |
| `pull failed: pnpm install failed: …` | Install error, usually network or a lockfile out of date on the branch | Fix the error and click again; the lagging lockfile retriggers the install |
| `pull failed: db:migrate failed: …` | A migration errored | Fix it and click again; pending migrations keep the button offered |
| `Module not found: Can't resolve '@console/…'` with no failed toast | The install ran outside the console, or not at all | `pnpm install`, then reload |
| New app's tile shows **Switched off** | Working as intended | Admin → **Feature flags** → **Enable** |

## Known limitation

`isSynced` checks the merge commit and pending migrations, not the installed lockfile. If an
install fails on a merge that has no migration, the toast reports the failure but the run stops
offering **Pull merged code**. Recover with `pnpm install` in the checkout, or **Sync with GitHub**
on `/runs`, which runs the sync again.

## Tests

`apps/console/tests/tools/automation-bridge.test.ts`, under `syncMergedRun` and `reconcileRuns`:

- skips when the checkout is not on the sync branch
- skips a modified tracked file so uncommitted edits are never clobbered
- deletes a merged run's untracked context.json so the pull can land it
- fails when the pulled HEAD does not contain the merge commit
- runs pnpm install before db:migrate when the pull changes a dependency manifest
- fails without migrating when pnpm install fails, and retries it on the next call
- runs db:migrate only while migrations are pending
- isSynced stays false while migrations are pending
- records one record_merge per merged run and pulls once

`apps/console/tests/lib/modes.test.ts` covers `ensureModeFlags` idempotency.

## Related

- [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md#merge-sync) — the merge sync step by step
- [DEVIN_RUN_SYNC_FIXES.md](DEVIN_RUN_SYNC_FIXES.md) — the other defects between Devin, GitHub and the console
- [INTEGRATION-SETUP.md](INTEGRATION-SETUP.md) — what serves from where, and recovery
- [LOOM-VIDEO-SCRIPT.md](LOOM-VIDEO-SCRIPT.md#-a-bug-we-hit-merged-but-not-live-30-seconds) — the 30-second telling
