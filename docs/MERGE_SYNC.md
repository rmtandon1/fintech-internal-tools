# Merge sync: keeping the running console in step with merged Devin PRs

When Devin squash-merges a run's PR into `cognition-dashboard-devin-integration`, the console pulls that merge into its own checkout so the served code matches what `devin_runs` says. There is no webhook and no polling daemon: the pull happens inside the same server actions that already confirm the merge on GitHub.

## Pieces

- `tools/automation/src/git.ts`: `GitRunner` — `currentBranch`, `status` (`git status --porcelain --untracked-files=all`), `head`, `pullFfOnly`, `isAncestor`, `removePath` (a plain file delete, not a git op) — over `child_process.execFile` (argv array, no shell). `SYNC_REMOTE` (`origin`) and `SYNC_BRANCH` (`cognition-dashboard-devin-integration`) are constants, overridable through the `SYNC_REMOTE` / `SYNC_BRANCH` env vars read in `apps/console/src/lib/bridge.ts`.
- `tools/automation/src/bridge.ts`:
  - `syncMergedRun(run, deps)` → `SyncOutcome` (`synced` / `unchanged` / `skipped` / `failed`). Only runs for a `merged` run; refuses when the checkout is on another branch or `status` reports anything but an untracked `runs/<id>/context.json` (see Runtime files below); pulls `--ff-only`; verifies `git merge-base --is-ancestor <mergeCommit> HEAD`; runs `pnpm db:migrate` while `deps.migrationsPending()` is true (`db:setup`/`db:seed` are never run — they re-seed the live database). Serialised through a module-level promise chain so two clicks never run two pulls. Writes no audit row: `record_merge` is the audit.
  - `isSynced(run, deps)`: the merge commit is an ancestor of HEAD *and* no migrations are pending; drives the **Pull merged code** button.
  - `reconcileRuns(actor, deps)`: pages through every `approved` run's id first (so transitions can't shift later pages), then `observeMerge` per run, then one pull for the newest merge.
- `apps/console/src/lib/bridge.ts`: `bridgeDeps()` supplies the real `GitRunner`, `migrationsPending` (compares `apps/console/drizzle/meta/_journal.json` entry `when` values to the newest `__drizzle_migrations.created_at`; a missing table means pending), and a `migrate` that runs `pnpm db:migrate` then registers declared tool constants in-process via `registerToolConstants()` (`apps/console/src/lib/register-tool-constants.ts`, also called by `instrumentation.ts` on start).
- `apps/console/src/app/automation-actions.ts`: `observeAutomationMerge` syncs right after `record_merge` applies; `syncAutomationRun` backs **Pull merged code**; `reconcileAutomationRuns` backs **Reconcile**; both manual paths are `engineer`-only. `BridgeResult` gains `retry` (client keeps polling) and `reload` (`router.refresh()`).
- `apps/console/src/components/run-actions.tsx`: **Check merge** retries up to 10× at 1.5 s while the server asks it to; **Pull merged code** appears on merged runs that are not yet synced.
- `apps/console/src/app/t/[tool]/page.tsx` + `apps/console/src/components/reconcile-runs.tsx`: **Reconcile** on `/t/automation` for the `engineer` role.

## Runtime files

`dispatchRun` writes `runs/<id>/context.json` into the local checkout before Devin ever sees it, and the run's PR commits the same file. So an untracked `runs/<id>/context.json` left by dispatch is not "dirt": when it belongs to a merged run and its SHA-256 matches the recorded `contextSha256`, the sync deletes it (`removePath`) and the pull recreates it from the merge. Any other status entry — a tracked modification, or an untracked file outside that pattern — still skips the pull; a leftover mismatched context.json collides in the pull and surfaces as `failed`.

## Migrations and constants

`migrationsPending` is the same check drizzle's migrator makes, decoupled from whether the pull moved HEAD: a failed `db:migrate` reports `failed`, but the next sync (or **Pull merged code** click) finds it still pending and retries even when `before === after`. `migrate` also registers any newly declared constants in-process, so a merged rule works without a restart; a production `next start` still needs a rebuild for new source regardless (the toast says "rebuild required").

## Flow

1. Engineer approves → `approve_pr` → GitHub review → Devin told to merge.
2. **Check merge** calls `observeAutomationMerge` until GitHub reports `merged`.
3. `record_merge` writes the audit row; `syncMergedRun` pulls `--ff-only` and migrates while `migrationsPending` is true.
4. `revalidatePath("/", "layout")` + `router.refresh()` puts the new code live; `migrate` registered the new constants in-process.

## Caveats

- The pull is manual-ish: it runs when **Check merge** records the merge, on **Pull merged code**, or on **Reconcile**. Without `GITHUB_TOKEN` `observeMerge` reports `unavailable` and nothing pulls.
- The pull only runs from a checkout on the sync branch with a clean-ish tree (see Runtime files); anything else is `skipped`, never clobbered.
- Manual pulls are `engineer`-only: both `syncAutomationRun` and `reconcileAutomationRuns` check the role server-side.
- A production `next start` serves a compiled `.next/` — the toast says "rebuild required" when `NODE_ENV === "production"`.
- `db:migrate` on the console's own database is the one migration the console runs on live data; the **No live writes** guard (`db:setup`, `db:seed`, `db:tamper`, raw SQL) is untouched.
