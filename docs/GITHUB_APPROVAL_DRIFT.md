# GitHub Approval Drift

Write-up for the engineering challenge the Loom script names: engineers approved and merged
Devin's pull requests on GitHub, and the console's governed record didn't follow. Found and fixed
on 29 September 2026 in #123. The fix is on `cognition-dashboard-devin-integration`.

## Why this was predictable

The console is the control: `approve_pr` runs through `executeIntent`, where
`approver_is_not_requester`, green checks and **Context untouched** are evaluated and an audit
row is written. But engineers review where the code is, on GitHub, and the integration branch has
no branch protection in this demo (`gh api …/branches/cognition-dashboard-devin-integration/protection`
returns `Branch not protected`). So there were two places to approve and merge, and the record
only listened to one.

| Where the engineer acted | What the console did before #123 |
|---|---|
| **Review and approve** in the console | Recorded `approve_pr`, posted the GitHub review, told Devin to merge |
| Approve on GitHub | Nothing. The run stayed **Devin working**, and Devin, which waits for the console's merge message, never merged |
| Merge on GitHub | Nothing. `observeMerge` only ran for `approved` runs and `record_merge` only accepted `approved`, so once Devin's session ended `observeSessionEnd` could record the run as stopped while its code was merged |

The first row is the governed path. The other two are the gap: approvals that skipped the
requester check, and merged code the audit log didn't know about.

## Symptom

A run whose pull request had an approving review on GitHub still read **Devin working** in the
console. A pull request merged on GitHub had no `record_merge` row, no merge commit on the run,
and so no **Pull merged code** offer.

## Diagnosis

Walk from GitHub back to the run record, one question at a time.

| # | Question | Where to look | What it showed |
|---|---|---|---|
| 1 | Does GitHub have the approval? | The PR's reviews: an `APPROVED` review at the head sha | Yes, by `rmtandon1` |
| 2 | Did the console read reviews on its poll? | `handleGet` in `apps/console/src/lib/devin-route.ts` | No. The poll read the session and, for `approved` runs only, the merge. Reviews were read only on an approval retry (`hasApprovingReview`, #64) |
| 3 | Could the console tell who approved? | `Actor` in `packages/engine/src/types.ts` | No. Console actors had no GitHub identity, so a review couldn't be tied to an engineer or checked against the requester |
| 4 | Could a merge be recorded without a console approval? | `record_merge` in `tools/automation/src/index.ts` | No. `fromStatus: ["approved"]` refused it |

Conclusion: nothing was broken inside either system. The console treated its own button as the
only source of approvals, and GitHub was a second one it never read.

## The fix: four layers

Each layer closes one gap, and each one routes through the same governed write path the button
uses rather than writing around it.

| Layer | Closes | Where |
|---|---|---|
| 1. Read GitHub on every poll | Approvals and merges nobody looked for | `listApprovingReviews` in `tools/automation/src/github-api.ts`; `handleGet` in `apps/console/src/lib/devin-route.ts` |
| 2. Know who approved | A review tied to no console actor | `Actor.githubLogin`, `actorForGitHubLogin` in `packages/engine/src/actor.ts`; `CONSOLE_REVIEW_PREFIX` |
| 3. Same control, same key | GitHub approvals skipping the requester check | `observeGitHubApproval` in `tools/automation/src/bridge.ts` → `previewActions`, then `executeIntent` `approve_pr` |
| 4. Record the gap | A merge with no approval, lost or recorded as stopped | `record_merge` from `running`, rule `merge_without_recorded_approval` in `tools/automation/src/index.ts`; `observeMerge` |

### Layer 1 · Read GitHub on every poll

- `GitHubClient.listApprovingReviews` returns every `APPROVED` review at the PR's head sha, with
  login, `submitted_at` and body. A review of an older commit doesn't count.
- `handleGet` runs, in order: `observeRun` → `observeGitHubApproval` → `observeMerge` (for
  `approved` and `running` runs) → `observeSessionEnd`. A merge is checked before the session end
  can record a stop.
- The `/runs` poller fetches the same route, so the Rule changes table follows without a run view
  open. The run view shows `Synced with GitHub · Ns ago` from `githubSyncedAt`.

### Layer 2 · Know who approved

- `DEMO_ACTORS.engineer.githubLogin` reads `GITHUB_APPROVER_LOGIN` (default `rmtandon1`);
  `actorForGitHubLogin` maps a review's author to a console actor, case-insensitively.
- The console's own review (body starts `Approved from the ops console`) is skipped, so a console
  approval isn't counted twice.
- A login no engineer claims records nothing. The run shows
  `Approved on GitHub by @login (not a console engineer)` as `githubNotice`.

### Layer 3 · Same control, same key

- A mapped engineer's review runs the same `approve_pr` intent as **Review and approve**: the same
  server-read `checksGreen` and `branchContextSha256`, the same idempotency key
  `approve_pr:<headSha>`, acting as that engineer, with the note `Approved on GitHub by @login`.
- So the same rules apply. The requester approving their own run on GitHub is refused by
  `approver_is_not_requester`, and the run shows the reason the button would.
- The policy is previewed first (`previewActions`). A transient denial, such as checks still
  running, returns before `executeIntent`, so it never stores a denied outcome under the key the
  eventual approval needs.
- Then the console sends Devin the existing merge message. No second GitHub review is posted.

### Layer 4 · Record the gap

- `record_merge` accepts `running` as well as `approved`. From `running` it keeps `approvedBy`
  null, writes rule `merge_without_recorded_approval` and sets the run's note to
  `Merged on GitHub without a recorded approval`. The approval row reads `not recorded`.
- A merge by a login that maps to a console engineer runs the same `approve_pr` as a review,
  with the note `Approved on GitHub by @login, who merged without a review`, before
  `record_merge`; the run lands `merge_follows_approval` with `approvedBy` set.
- Any other merge — no `merged_by`, an unmapped login, or an approval the rules deny — records
  the gap note naming the merger from `merged_by`.
- `observeMerge` falls back to the PR URL from the poll or the session's latest structured output,
  so a PR merged before `record_pr` ran is still found.
- The merge is recorded as the approver when there is one, else as the console's engineer actor
  (`mergeRecorder`), since `record_merge` is engineer and admin only.

### What it deliberately doesn't do

- **Enforce.** The console records what happened on GitHub; it can't stop a merge there. That's
  branch protection's job: one approving review, the four CI checks, no bypass for Devin's account
  ([GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md#branch-protection)).
- **Hide the gap.** A merge without an approval is recorded, not refused, because refusing it
  would leave merged code with no row at all.

## Tests

`apps/console/tests/tools/automation-bridge.test.ts`, under `observeGitHubApproval`:

- treats the mapped engineer's GitHub approval as approve_pr and tells Devin to merge, without another review
- a second poll neither re-approves nor re-messages
- denies the requester's own GitHub approval by the same rule as the button
- surfaces an approval by a login no console engineer claims and records nothing
- ignores the console's own review, even though it carries the engineer's login
- reports a denial while checks are red without spending the approval's idempotency key

Under `observeMerge and stopRun`: records a merge GitHub reports on a running run, naming the
missing approval; counts a merge by the mapped engineer as their approval before recording the
merge; records a merge by a login no engineer claims, naming the merger in the gap note; merges
with the named-gap note when the merger's approval is denied by red checks.

`apps/console/tests/api/devin-route.test.ts`: records the mapped engineer's GitHub approval on
the poll and tells Devin to merge, once; shows an approval by a login no engineer claims without
recording it; records the mapped engineer's merge as their approval, and links the changed tool;
records a merge GitHub reports before any approval, and says so on the run.

These run against scripted GitHub and Devin clients. #123's browser check ran in simulation mode,
so the day-ahead Kestrel run is approved on GitHub to check one real approval (Loom Demo Checklist).

## Related

- [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) — the approval-sync section and branch protection
- [DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md) — § Approval and merge, both approval routes
- [DEVIN_RUN_SYNC_FIXES.md](DEVIN_RUN_SYNC_FIXES.md) — earlier defects between Devin, GitHub and the console, including #64's refused-review retry
- [POST_MERGE_DEPLOYMENT_DRIFT.md](POST_MERGE_DEPLOYMENT_DRIFT.md) — the other layered fix: merged code reaching the running console
- [LOOM-VIDEO-SCRIPT.md](LOOM-VIDEO-SCRIPT.md#-challenge-github-approval-drift-30-seconds) — the 30-second telling
