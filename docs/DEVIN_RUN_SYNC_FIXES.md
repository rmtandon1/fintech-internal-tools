# Devin Run Sync Fixes

Post-mortem of the defects found while wiring console runs to Devin and GitHub, 25–28 September
2026. Each one broke the link between what Devin or GitHub had done and what the console
showed. All are fixed on `devin/1790697259-loom-sandbox`. Post-merge deployment drift, the running console
lagging the merged branch, is written up separately in [POST_MERGE_DEPLOYMENT_DRIFT.md](POST_MERGE_DEPLOYMENT_DRIFT.md).

## Issues Identified

| # | Symptom | Found | Status |
|---|---|---|---|
| 1 | A run's pull request link disappeared from the console | 25 Sep | ✅ FIXED (#34) |
| 2 | Devin sessions didn't know which repository to work in | 25 Sep | ✅ FIXED (#39) |
| 3 | A merged run was recorded as stopped | 27 Sep | ✅ FIXED (#45) |
| 4 | The console failed to build: `Can't resolve 'fs'` | 28 Sep | ✅ FIXED (#60) |
| 5 | A run stuck at **Approved** when GitHub refused the review | 28 Sep | ✅ FIXED (#64) |
| 6 | Both live Kestrel runs stopped at Verify | 28 Sep | ✅ FIXED (#65) |

---

## 1. Pull request link lost between polls ✅ FIXED

**Issue.** The run view showed the pull request, then lost it. **Review and approve** had no PR
to approve.

**Root Cause.** The PR URL was read from the latest session poll only. Devin's
`structured_output` isn't guaranteed to repeat `pr_url` on every update, so a later poll without
it erased the PR from the view. Nothing had written it down.

**Fix Applied.**

- New audited action `record_pr` in the automation tool. The first poll that reports `pr_url`
  submits it, once.
- Rule `pr_not_yet_recorded` denies any second `record_pr`, so the stored URL can't be replaced.
- `approveRun` records the session's PR before `approve_pr` if no poll has yet.
- A normal run now writes five audit rows: `dispatch`, `record_session`, `record_pr`,
  `approve_pr`, `record_merge`.

Tests: `record_pr` applied once; the PR survives a poll with no structured output; no write while
no PR is reported.

## 2. Sessions didn't know the repository ✅ FIXED

**Issue.** API-created sessions started without a repository and couldn't open a pull request
against the right branch.

**Root Cause.** The session prompt carried the sentence and the attachment, but never named the
GitHub repository, base branch or base commit.

**Fix Applied.**

- The prompt now reads `Repository: https://github.com/<owner>/<repo>. Branch from
  devin/1790697259-loom-sandbox at <sha7> and open the pull request against
  devin/1790697259-loom-sandbox.`
- The repository comes from `GITHUB_REPOSITORY`, else the checkout's `origin` remote.
- `parseGitHubRepository` accepts only `github.com` remotes, and an override that isn't a plain
  `owner/repo` is dropped, so it can't add lines to the prompt.

## 3. Merged run recorded as stopped ✅ FIXED

**Issue.** An approved run whose PR had merged showed **Stopped** instead of **Live**.

**Root Cause.** When Devin merged and then wound the session down, the next poll saw the session
had ended and recorded `stop` before anything checked GitHub for the merge.

**Fix Applied.**

- `GET /api/devin/<runId>` checks an approved run's PR for a merge before it looks at whether
  the session ended.
- `/runs` polls every in-flight run every 5 seconds while open, so a session that ends is
  recorded even with no run view open.

Test: `devin-route.test.ts`, "an approved run whose poll reports the session ended and whose
GitHub PR is merged lands merged with a record_merge row and no stop row".

## 4. Build failed with `Can't resolve 'fs'` ✅ FIXED

**Issue.** `pnpm dev` failed to compile the run page:

```
Module not found: Can't resolve 'fs'
```

**Root Cause.** The approval dialog is a client component. It imported `sharedPathsTouched` from
`lib/run-surface`, which imports `@console/tool-automation` and the SQLite connection. That pulled
server-only code into the browser bundle.

**Fix Applied.**

- The dialog reads the shared-path list from the client-safe entry point instead.
- The same rule applies to any client component: import from files that don't reach
  `@console/db*` or `node:*`.

## 5. Run stuck at Approved after a refused review ✅ FIXED

**Issue.** An engineer approved, the console recorded `approve_pr`, but GitHub refused the review
(`403` with a read-only token). Retrying did nothing, because the approval was already recorded.
Devin never merged.

**Root Cause.** The audited approval commits before its side effect, by design. A retry replayed
the stored outcome and skipped the GitHub call.

**Fix Applied.**

- New `GitHubClient.hasApprovingReview`: is there an `APPROVED` review at the PR's head sha?
- On a replayed `approve_pr`, `approveRun` checks GitHub and posts the review only when it's
  missing.
- The audit log still holds one approval per head sha.

## 6. Kestrel runs stopped at Verify ✅ FIXED

**Issue.** Both live Kestrel runs stopped at Verify.

**Root Cause.** The rule correctly changed behaviour that two existing tests pin:
`refunds-clusters.test.ts` (each Kestrel refund previews as allowed) and `kyc-case-file.test.ts`
(the exact list of KYC approve rules). Neither file was in the plan, so editing them would fail
**Stays in plan**, and not editing them failed the tests.

**Fix Applied.**

- The playbook's Plan step now finds the existing tests that pin the rule list, trace order and
  per-record decisions, and plans them as `modify`.
- A failure in an unplanned test file stops the run and names the file in `stopped_by`.
- [DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md): the Plan phase passes only when every affected
  existing test file is listed.
- The Kestrel checklist gained a ninth line: the changed existing tests are named in the plan.

⚠ The org playbook must be re-registered with `pnpm devin:playbook` for sessions to see this.

---

## Next Steps

- [x] ✅ `record_pr` recorded once and kept across polls
- [x] ✅ Repository, base branch and base commit named in every prompt
- [x] ✅ Merge checked before session end
- [x] ✅ Approval dialog kept out of the server-only bundle
- [x] ✅ Refused GitHub reviews re-posted on retry
- [x] ✅ Affected existing tests planned before the first edit
- [x] ✅ `pnpm verify` green on the integration branch after each fix
