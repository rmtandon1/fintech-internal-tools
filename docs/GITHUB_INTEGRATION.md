# GitHub Integration

How the console, CI and Devin use GitHub: the token, the API calls, the CI jobs, CODEOWNERS,
branch protection, and the merge sync that brings merged code back into the console.

## Summary

- The console reads pull requests, checks and reviews, and posts the engineer's approving review,
  with `GITHUB_TOKEN` from the server's `.env`.
- An approving review given on GitHub by `GITHUB_APPROVER_LOGIN` (default `rmtandon1`) is
  recorded as the console engineer's `approve_pr`; a PR merged on GitHub before any approval is
  recorded as merged with the missing approval named on the run.
- CI (`.github/workflows/verify.yml`) runs two jobs on every pull request: `verify` and `guards`.
- CODEOWNERS adds the engine owner to any pull request that touches the governed write path.
- Devin merges once the console approves. The console never pushes; it only pulls.
- After a merge, the console fast-forwards its own checkout and migrates its own database.

---

## The token

`GITHUB_TOKEN` in the root `.env`, read only by `apps/console/src/lib/bridge.ts`. Without it the
console runs, Devin runs still open pull requests, but **Review and approve** and the merge
check are unavailable (`GitHub API is not configured: set GITHUB_TOKEN on the server`).

A fine-grained token on `rmtandon1/fintech-internal-tools` needs:

| Permission | Access | Used for |
|---|---|---|
| Pull requests | Read and write | Reading the PR, listing reviews, posting the approving review |
| Contents | Read | Hashing `runs/<run_id>/context.json` on the PR branch |
| Checks | Read | Check runs on the head commit |
| Commit statuses | Read | The combined status on the head commit |

The review is posted as the token's owner, who acts as the approving engineer. GitHub doesn't
let an account approve its own pull request, so the token must not belong to Devin's GitHub
account.

`GITHUB_APPROVER_LOGIN` (default `rmtandon1`) is the GitHub login the console's `engineer` actor
answers to. While a run is `running` with a PR, every poll lists the approving reviews at the
PR's head; the first one by that login — other than the console's own review, whose body starts
`Approved from the ops console` — runs the same `approve_pr` intent the **Review and approve**
button runs, as that engineer, with the same server-read inputs and the same idempotency key, and
then sends Devin the same merge message. No second review is posted. An approval by a login no
actor claims is shown on the run view as `Approved on GitHub by @login (not a console engineer)`
and records nothing; one the rules refuse (requester, red checks, changed context) shows the
denial the same way the button would.

## Calls the console makes

All from `tools/automation/src/github-api.ts`, server-side only.

| Call | Endpoint | When |
|---|---|---|
| `getPull` | `GET /repos/{owner}/{repo}/pulls/{n}` | Approval and merge checks: head sha, merged, merge commit |
| `getChecks` | `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` and `/status` | Approval: every check run and status must be green |
| `fileSha256` | `GET /repos/{owner}/{repo}/contents/runs/<id>/context.json?ref=<sha>` | Approval: **Context untouched** |
| `approvePull` | `POST /repos/{owner}/{repo}/pulls/{n}/reviews` with `event: APPROVE` | After `approve_pr` commits |
| `hasApprovingReview` | `GET /repos/{owner}/{repo}/pulls/{n}/reviews` | Retrying an approval: re-posts the review only when it's missing (#64) |
| `listApprovingReviews` | `GET /repos/{owner}/{repo}/pulls/{n}/reviews` | Every poll of a running run with a PR: approvals given on GitHub, with author, time and body |

The repository comes from `GITHUB_REPOSITORY` when set (a plain `owner/repo` only), otherwise
from the serving checkout's `origin` remote on github.com. `GITHUB_API_BASE` overrides
`https://api.github.com`.

## CI

`.github/workflows/verify.yml` runs on every pull request and on pushes to
`devin/1790697259-loom-sandbox`. A newer push cancels the older run on the same ref.

| Job | Steps | Fails when |
|---|---|---|
| `verify` | Install (`--frozen-lockfile`), Lint, Typecheck, Boundaries, Test | Any step fails |
| `guards` | `tsx scripts/run-guard.ts --markdown`, then posts or updates one PR comment marked `<!-- run-guard -->` | A guard check fails on a run branch |

The approval dialog requires every check run on the PR's head to be green, so both jobs gate
**Approve as engineer**. What each check does is in [CODE_QUALITY.md](CODE_QUALITY.md).

## CODEOWNERS

`.github/CODEOWNERS` names `@rmtandon1` on:

- `packages/engine/`, `packages/db-write/`, `packages/db-core/`, `packages/db/`,
  `packages/permissions/`, `apps/console/drizzle/`, `apps/console/src/app/actions.ts`
- `scripts/check-boundaries.ts`, `scripts/run-guard.ts`, `runs/`, `.devin/`,
  `.github/CODEOWNERS`, `.github/workflows/`

A Devin run that adds a table (Chargebacks) touches `apps/console/drizzle/`, so the engine owner
is requested as well as an engineer. The guard's **Shared code reported** line names these
paths on the PR. CODEOWNERS only binds when branch protection requires code-owner review.

## Branch protection

**As of 2026-09-28, `devin/1790697259-loom-sandbox` is not protected.**

```bash
gh api repos/rmtandon1/fintech-internal-tools/branches/devin/1790697259-loom-sandbox/protection
# {"message":"Branch not protected", … "status":"404"}
```

The console's approval still gates Devin's merge: Devin waits for the console's message — sent
after a console approval or after the console sees the mapped engineer's approval on GitHub —
and `approve_pr` refuses the requester. A PR merged on GitHub without either is still recorded
(`record_merge` from `running`), with the run's note reading `Merged on GitHub without a
recorded approval` so the gap is visible rather than hidden. What GitHub adds is enforcement against anything that
doesn't go through the console. To turn it on:

```bash
gh api -X PUT repos/rmtandon1/fintech-internal-tools/branches/devin/1790697259-loom-sandbox/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["verify", "guards"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "require_code_owner_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

⚠ Once on, direct pushes to the branch are refused, including docs commits. Everything goes
through a pull request.

## Merge sync

When a run merges, the console brings the merge into the checkout it serves from.
`syncMergedRun` in `tools/automation/src/bridge.ts`:

1. Runs one sync at a time.
2. Skips unless the run is `merged` with a merge commit.
3. Skips unless the checkout is on `devin/1790697259-loom-sandbox` (or `SYNC_BRANCH`).
4. Skips if the working tree has changes, except an untracked `runs/<id>/context.json` that
   dispatch wrote. When that file hashes to the merged run's `contextSha256` it's deleted, so
   the pull can recreate it.
5. Runs `git pull --ff-only origin devin/1790697259-loom-sandbox` (or `SYNC_REMOTE`).
6. Fails if the merge commit isn't on `HEAD` afterwards.
7. Runs `pnpm install --frozen-lockfile` when the pull changed a `package.json`,
   `pnpm-lock.yaml` or `pnpm-workspace.yaml`, or when `node_modules/.pnpm/lock.yaml` still lags
   the lockfile, so a newly merged workspace package resolves (#72).
8. Runs `pnpm db:migrate` when drizzle's journal is ahead of `__drizzle_migrations`, then
   `registerToolConstants()` and `ensureModeFlags()`, so new settings and a new app's off flag
   exist without a re-seed or restart.

It never runs `db:setup` or `db:seed`. Every git command goes through `execFile` with an argument
array, never a shell.

The sync runs when the console records the merge. If it was skipped, the run offers
**Pull merged code**. If nobody had the run open when it merged, `/runs` → **Sync with GitHub**
(engineer only) reads every approved run's PR, records the merges, and pulls the newest one.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Approval fails with `GitHub API 403` on `/reviews` | Token lacks pull-request write, or belongs to the PR author | Use an engineer's token with write access; retry the approval |
| Approval refused: checks not green | A check run is pending or failed | Wait for CI, or fix the failure on the branch |
| Approval refused: context differs | `runs/<id>/context.json` on the branch changed | The run is void; stop it and dispatch again |
| `skipped: checkout is not on devin/1790697259-loom-sandbox` | Serving checkout switched branch | `git switch devin/1790697259-loom-sandbox`, then **Pull merged code** |
| `skipped: working tree has uncommitted changes` | Edits in the serving checkout | Move them to a worktree ([INTEGRATION-SETUP.md](INTEGRATION-SETUP.md) issue 2) |
| `failed: db:migrate failed: …` | Migration error | Fix forward in a PR; the next sync retries |
| No PR comment from `guards` | PR from a fork | The comment step runs only for branches in the same repository |
