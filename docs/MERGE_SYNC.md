# Merge sync: keeping the running console in step with merged Devin PRs

When Devin squash-merges a run's PR into `cognition-dashboard-devin-integration`, the console pulls that merge into its own checkout so the served code matches what `devin_runs` says. There is no webhook and no polling daemon: the pull happens inside the same server actions that already confirm the merge on GitHub.

## Pieces

- `tools/automation/src/git.ts`: `GitRunner` — `currentBranch`, `isClean`, `head`, `pullFfOnly`, `isAncestor`, `changedPaths` — over `child_process.execFile` (argv array, no shell). `SYNC_REMOTE` (`origin`) and `SYNC_BRANCH` (`cognition-dashboard-devin-integration`) are constants, overridable through the `SYNC_REMOTE` / `SYNC_BRANCH` env vars read in `apps/console/src/lib/bridge.ts`.
- `tools/automation/src/bridge.ts`:
  - `syncMergedRun(run, deps)` → `SyncOutcome` (`synced` / `unchanged` / `skipped` / `failed`). Only runs for a `merged` run; refuses when the checkout is on another branch or the tree is dirty; pulls `--ff-only`; verifies `git merge-base --is-ancestor <mergeCommit> HEAD`; runs `pnpm db:migrate` when the diff touched `apps/console/drizzle/` (`db:setup`/`db:seed` are never run — they re-seed the live database). Serialised through a module-level promise chain so two clicks never run two pulls. Writes no audit row: `record_merge` is the audit.
  - `isMergeLocal(run, deps)`: whether HEAD already contains the merge commit; drives the **Pull merged code** button.
  - `reconcileRuns(actor, deps)`: `observeMerge` for every `approved` run, then one pull for the newest merge.
- `apps/console/src/lib/bridge.ts`: `bridgeDeps()` supplies the real `GitRunner`, the `pnpm db:migrate` migrate function and the env overrides.
- `apps/console/src/app/automation-actions.ts`: `observeAutomationMerge` syncs right after `record_merge` applies; `syncAutomationRun` backs **Pull merged code**; `reconcileAutomationRuns` backs **Reconcile**. `BridgeResult` gains `retry` (client keeps polling), `reload` (`router.refresh()`) and `reloadFull` (`location.reload()`, set when `migrated` so `instrumentation.ts` re-registers declared constants).
- `apps/console/src/components/run-actions.tsx`: **Check merge** retries up to 10× at 1.5 s while the server asks it to; **Pull merged code** appears on merged runs whose commit is not local.
- `apps/console/src/app/t/[tool]/page.tsx` + `apps/console/src/components/reconcile-runs.tsx`: **Reconcile** on `/t/automation` for the `engineer` role.

## Flow

1. Engineer approves → `approve_pr` → GitHub review → Devin told to merge.
2. **Check merge** calls `observeAutomationMerge` until GitHub reports `merged`.
3. `record_merge` writes the audit row; `syncMergedRun` pulls `--ff-only` and migrates if drizzle changed.
4. `revalidatePath("/", "layout")` + `router.refresh()` (or a full reload after a migration) puts the new code and constants live.

## Caveats

- The pull is manual-ish: it runs when **Check merge** records the merge, on **Pull merged code**, or on **Reconcile**. Without `GITHUB_TOKEN` `observeMerge` reports `unavailable` and nothing pulls.
- The pull only runs from a checkout on the sync branch with a clean tree; anything else is `skipped`, never clobbered.
- A production `next start` serves a compiled `.next/` — the toast says "rebuild required" when `NODE_ENV === "production"`.
- `db:migrate` on the console's own database is the one migration the console runs on live data; the **No live writes** guard (`db:setup`, `db:seed`, `db:tamper`, raw SQL) is untouched.
