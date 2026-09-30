# Devin Run Protocol

## Summary

- A business rule in this console is code. Devin adds, changes or removes it in a run, and a person approves every merge.
- Feature specs (`REFUND_CLUSTERING_HOLD.md`, `COMPANIES_HOUSE_CHECK.md`, `CHARGEBACKS_FROM_POWER_APPS.md`) supply a suggested sentence the requester can accept or rewrite, plus allowed paths and the reviewer checklist. The house rules below apply to every run. A session never reads the spec unless the spec asks to be sent; then it reads only the sections marked as sent to Devin.
- Starting a run is a governed write, like any other action. Each run appears in the audit chain five times, when it is requested, picked up, opens its pull request, is approved, and merges.
- The console hands Devin a context file with the live settings and evidence, without customer data. Devin commits its plan before its first edit, and security checks in CI hold the diff to that plan.
- An engineer reviews and merges the pull request on GitHub. Devin never merges; the console records the merge and pulls it into the running console.
- An undo removes one earlier change from the code as it is now, keeping everything merged since.
- Switching a rule off is a setting change on `/admin/policy`, in seconds, with no run.
- The console talks to the Devin v3 API from the server. `DEVIN_API_KEY` is the only setting it needs. Without it the console says Devin is not connected and dispatches nothing.



## The model

A business rule in this console is code. When risk wants a rule changed, Devin changes the code. When risk wants it gone, Devin takes it out. There is no feature flag in between, and no dead branch left waiting for cleanup.

That puts two requirements on every run. It must be as safe to undo as it was to make. And the undo must work on the codebase as it is at undo time, not as it was when the change merged.

## Operations


| Operation | What it does                                                       | Who starts it                                                            | Devin session? |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------- |
| `change`  | Adds, changes or removes code under the spec's allowed paths       | Manager whose domain matches the spec's, or admin                        | Yes            |
| `undo`    | Undoes one earlier merged change, keeping everything merged since  | Admin                                                                    | Yes            |


Moving a threshold or switching a rule off is a setting change on `/admin/policy`, in seconds and audited. A run is for changes a setting can't express.

### Allowed paths and who reviews

What a change may touch is the spec's `allowedPaths` list — the path globs the console copies into `context.json` at dispatch. There is no scope: a spec that reaches shared paths, such as a new app whose table sits under `apps/console/drizzle/` (`CHARGEBACKS_FROM_POWER_APPS.md`), simply lists them. Who reviews is decided by CODEOWNERS from the diff: a run that touches shared paths — `packages/`, `apps/console/drizzle/`, `apps/console/src/app/actions.ts`, shared components, `AGENTS.md` — pulls in the paths' owners as well as the approving engineer, and the guard's **Shared code reported** check names them on the PR.

### Switching a rule off in seconds (KILL_SWITCH)

Every rule a run adds reads its thresholds from admin-editable constants, and its spec names one value that makes the rule inert. For the clustering hold, that is a window of 0 days. The admin sets it on `/admin/policy`: immediate, audited, and no flag in the code. It covers the minutes an undo takes to open and be approved, while the rule may be routing genuine refunds to the Manager queue. The undo then removes the rule from the code.

Policy rules use constants, and product flags such as `payments.card_network_failover` stay flags, governed by the console. Reasoning: `DEVIN-NO-DEVIN.md` › Policy rules and product flags.

## Starting a run is a governed write

Dispatch goes through `executeIntent` like every other write. A small `automation` tool (`tools/automation/`) owns a `devin_runs` table and six actions: `dispatch`, `record_session`, `record_pr`, `approve_pr`, `record_merge` and `stop`.

`dispatch` rules:

- The role may start this operation (table above).
- No other run is in flight against the same tool.
- An undo names a merged change that has not already been undone.
- A change carries evidence, such as a non-empty cluster.

The effect writes the run row and the audit row in one transaction. The HTTP call to Devin happens after the commit, never inside it. `record_session` then stores the session id. If the call fails, the run row is marked `dispatch_failed` through the same intent path.

Polled run state is never written to `devin_runs`. Phase, `status_detail` and `structured_output` come from the session poll and are held in memory, not persisted. The one fact a poll does record is the pull request: the first time the session reports `pr_url`, the console submits `record_pr`, so a later poll that omits it cannot lose the PR. Only audited transitions touch the table: `dispatch`, `record_session`, `record_pr`, `approve_pr`, `record_merge` and `stop`. That keeps a run at five audit rows on the normal path (dispatch, record_session, record_pr, approve_pr, record_merge), with `stop` or `dispatch_failed` replacing the later rows when a run ends early.

`stop` also records terminal session failure. When a poll reports the session has ended — `stopped`, `expired` or `failed`, or a phase stopped the run (§ Phases) — the console submits `stop` with the reported reason, so the row leaves the in-flight state and the "no other run in flight against the same tool" rule releases the tool. Without that, a failed run would block the next `dispatch` until someone pressed **Stop run**. A `stop` row names whether it was an operator's click or a reported failure.

`approve_pr` rules:

- The actor is an `engineer`. This is a new role, added to `ROLES` and `ROLE_META` in `packages/permissions/src/roles.ts` and `DEMO_ACTORS` in `packages/engine/src/actor.ts` by the build agent, with a level `canApprove` excludes (`AGENT_TRIGGER_SURFACE.md` § Build). It is not a Devin run.
- The approver is not the run's requester.
- The PR's required checks are green: Lint, Typecheck, Boundaries and Test (what `pnpm verify` runs).
- **Context untouched**: the branch's `runs/<run_id>/context.json` hashes (SHA-256) to the `contextSha256` stored in the dispatch audit row. This is the one check the console runs itself, because CI can't read its SQLite.

Its effect submits an approving review to GitHub as the engineer; the engineer then merges on GitHub. The same intent also runs when a poll finds an approving review on GitHub by the engineer's mapped login (`GITHUB_APPROVER_LOGIN`, default `rmtandon1`), acting as that engineer, with the note `Approved on GitHub by @login` and no second review. See § Approval and merge.

`record_merge` accepts a run in `approved` or `running`. A merge GitHub reports before the console recorded an approval is still written, with `approvedBy` left null and the run's note set to `Merged on GitHub without a recorded approval`: the audit trail shows the gap rather than hiding it.

A PR GitHub reports closed without a merge lands `stop` instead, from `running` or `approved`, with the reason `PR #N was closed on GitHub without merging`; the run view shows it as `Stopped: PR #N was closed on GitHub without merging`.

Every run therefore appears in the hash chain five times: when it was asked for, when Devin picked it up, when it opened its pull request, when an engineer approved it, and when it merged.

## What the console hands Devin

Devin's VM runs a freshly seeded database. It cannot see `apps/console/data/console.db`, where live constants, refund rows and admin edits live. So the console captures that state at dispatch and hands it over. Devin never reads the live database, and never has to guess it.

`runs/<run_id>/context.json` is written by the console and passed as a session attachment:

```json
{
  "run_id": "01K5Z3Q8M4V7N2X9C6B1D0F3GH",
  "operation": "change",
  "spec": "REFUND_CLUSTERING_HOLD.md",
  "intent": "Once a merchant's \"not received\" refunds add up past the manager limit, send them to a manager for approval. Send those customers' KYC approvals to a manager too.",
  "requested_by": "manager",
  "base": { "branch": "cognition-dashboard-devin-integration", "commit": "1a67f60…" },
  "allowed_paths": [
    "tools/refunds/src/clustering-hold.ts",
    "tools/refunds/src/index.ts",
    "tools/kyc/src/index.ts",
    "apps/console/tests/tools/refunds-clustering-hold.test.ts",
    "apps/console/tests/tools/kyc.test.ts"
  ],
  "constants": {
    "refunds.manager_approval_usd_minor": 50000,
    "kyc.manager_review_score": 70
  },
  "evidence": {
    "source": "refunds:Kestrel Outdoors",
    "rows": [
      { "id": "rfnd_0011", "facts": { "merchant": "Kestrel Outdoors", "reasonCode": "not_received", "usdMinor": 48000, "requestedAt": "2026-09-20T09:12:00Z" } }
    ]
  },
  "reverses": null,
  "audit_head": { "seq": 214, "rowHash": "e3b0…" }
}
```

- **Evidence rows carry no PII.** Emails and card numbers are dropped, not masked. Devin needs the amounts, merchant, reason and timing to write a regression test. It doesn't need the customer.
- **`allowed_paths` is the spec's allowed-paths list as path globs.** The console copies it from the spec at dispatch and adds `runs/<run_id>/`. It is what makes the plan checkable: the reviewing engineer matches every `plan.json` path against these globs, rather than parsing the spec's prose.
- **The dispatch audit row stores the SHA-256 of this file.** The `approve_pr` rule checks that the file committed on the branch hashes to the same value, so what Devin worked from is provably what the console sent. CI cannot do this check, because it cannot read the console's SQLite.
- **For an undo**, `reverses` names the change's run id and merge commit. `constants` then carries both the values at that change's dispatch and the values now.

The session itself gets:

- `playbook_id`: the Devin playbook holding this protocol.
- `prompt`: the intent sentence, the operation and the run id. The prompt names its spec path only when the spec asks to be sent.
- The attachment above.
- `structured_output_schema`: see § Progress.
- `max_acu_limit`: the run's budget.
- `tags`: `run:<run_id>`, `operation:<operation>`.

It never gets reference code. A run never gets the spec unless the spec asks to be sent. The spec's acceptance tests are the engineer's checklist in the approval dialog (`RunnableSpec.acceptance`), so the time window, which refunds count and where the rule sits in the trace are Devin's to work out from the code, and the reviewer checks them afterwards. Specs include a reference implementation for the reviewer, and Devin works out its own.

## House rules for new code

The requester's sentence carries the business need; these rules carry how the code is built. They apply to every run, whatever the sentence says.

- **Outside services.** Read the provider's API docs on the web before writing a client. The client lives in the tool that uses it. Its key is read on the server from `<SERVICE>_API_KEY`, documented in `.env.example`, and never logged or sent to the browser. One call per action, with a timeout of at most five seconds.
- **Failure holds, never passes.** A lookup that times out, errors or finds nothing shows "couldn't check" and holds approval like a material difference.
- **Recorded responses.** Tests never call the live service; they replay recorded responses. When the session has the key, record them from the live service; otherwise write them from the provider's documented response shape. Without the key at runtime, the console uses the same recordings and labels the result "test data". A seeded record's result comes from the service, never from a recording invented for it.
- **Off until someone turns it on.** A new check or rule that changes decisions sits behind a switch setting the tool declares, named `<tool>.<snake_case_name>`: a boolean, false by default. While it is off nothing changes; a manager or admin switches it on after the merge, as its own audited change.
- **Reuse the write path.** Writes go through `executeIntent` from an action; opening a page writes nothing. A new finding lands in the tables and rules that already hold that kind of finding (for KYC, the case's checks and Declared vs found) before any new table or rule.

## Phases

Each phase passes or stops the run, except that the guard checks are advisory: an unplanned file is reported on the PR for the reviewer, not a stopped run.


| Phase        | Passes when                                                                                                                                                  | On failure                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Intake       | The spec is registered in `specs.ts`. The context file parses. Its base commit is the branch head, or the run rebases cleanly                                                     | Stop. No branch is created                                                                                     |
| Baseline     | `pnpm verify` is green at the base commit. Per-file test counts are recorded                                                                                 | Stop. No branch is created                                                                                     |
| Plan         | `runs/<run_id>/context.json` (verbatim) and `runs/<run_id>/plan.json` (the files Devin will touch, and why) are committed alone as the branch's first commit; the plan lists every existing test file whose assertions the change moves | Stop. Delete the branch                                                                                        |
| Edit         | Planned files change; `context.json` and `plan.json` do not. A file outside the plan is recorded in `files` and a note                                       | Reported by the guard on the PR; the run continues                                                             |
| Verify       | `pnpm verify` is green. The tests named in `plan.json` pass. Test counts per file are at or above baseline. `pnpm check:run` results are reported in `guards`   | Two fix attempts, then reset and stop                                                                          |
| Pull request | A PR is opened against `cognition-dashboard-devin-integration`                                                                                                    | Leave the branch pushed and report                                                                             |
| Merge        | Devin waits at `waiting_for_user`; the engineer merges on GitHub and the console records `record_merge`                                                      | Nothing to report: Devin stops after the pull request                                                          |


The plan is Devin's own, committed before any edit. The spec's allowed paths bound what the plan may touch. Committing first is what makes the boundary checkable: the reviewing engineer compares the diff with a list Devin wrote before it knew what the diff would be. Existing tests that pin the current behaviour (rule counts, trace order, per-record decisions) count as files the change touches and belong in the plan; a run that meets one it did not plan carries on and the guard names the file on the PR.

`plan.json` holds `files[]` (path, `create | modify | delete`, one-line reason), `reuses[]` (existing modules the change builds on, each with a one-line reason), `acceptance[]` (the tests it will write, one per behaviour; when the spec is sent it names the spec's acceptance tests) and, for a change that removes a rule or an undo, `removed_tests[]` of `{ file, name }`: each test the run will delete because it asserts the rule being taken out. The reviewer permits exactly those removals and no others; otherwise the array is absent or empty. `reuses[]` is informational and not a boundary.

## Progress

The Devin API doesn't stream sub-steps. The session's `structured_output` is the channel. The playbook tells Devin to update it at each phase boundary, and to append sub-events as each one completes (each `verify_steps` gate is one entry, updated in place to its final result after a rerun), so the run view (`AGENT_TRIGGER_SURFACE.md` § The run view) shows artifacts rather than counts:

```json
{
  "phase": "verify",
  "phase_status": "running",
  "phase_durations_s": { "intake": 41, "baseline": 212, "plan": 96, "edit": 604 },
  "base_commit": "1a67f60",
  "context_sha256": "9f2c41ab…",
  "branch": "devin/01K5Z3Q8-clustering-hold",
  "plan_commit": "c7d19e2",
  "reuses": [
    { "module": "packages/engine/src/execute-intent.ts", "reason": "hold is registered as an intent, not a side path" },
    { "module": "packages/engine/src/execute-intent.ts", "reason": "routed actions are applied by allowed manager roles without an approval request" },
    { "module": "packages/engine/src/audit", "reason": "the manager's direct action is audited; routing itself creates no row" }
  ],
  "files": [
    { "path": "tools/refunds/src/clustering-hold.ts", "op": "create", "additions": 84, "deletions": 0, "reason": "clustering_hold rule and shared cluster query" },
    { "path": "tools/kyc/src/index.ts", "op": "modify", "additions": 12, "deletions": 1, "reason": "linked_refund_hold on approve" }
  ],
  "verify_steps": [
    { "name": "Lint", "pass": true },
    { "name": "Typecheck", "pass": true },
    { "name": "Boundaries", "pass": true },
    { "name": "Test", "pass": null, "before": 68, "after": null }
  ],
  "notes": [
    { "phase": "baseline", "text": "Ran the base tests and saw all 68 pass" },
    { "phase": "verify", "text": "Opened localhost:3001/t/refunds and saw routed refunds in the Manager queue with the clustering_hold trace" }
  ],
  "conflicts": [],
  "pr_url": null,
  "stopped_by": null
}
```

- `reuses` is copied from `plan.json` when the Plan phase lands and does not change after. It drives the "Reusing …" lines of the run checklist.
- `files` fills during Edit. Before that, the plan's paths come from `plan.json`.
- `notes` records plain-English actions not shown by the other fields and drives the plain-English sub-lines under each checklist phase.
- `conflicts` is used by an undo: one entry per conflicted file, with what was kept (`"partial_delivery reason code, PR #7"`) and what was removed (`"clustering_hold registration"`).

The console polls the session (`GET /v3/organizations/{org_id}/sessions/{devin_id}`) and reads `status`, `status_detail` and `structured_output`. `status_detail = waiting_for_user` surfaces as a reply box, and the reply is sent through the messages endpoint. **Stop run** calls the terminate endpoint (`DELETE` on the same path) and marks the run `stopped` through an intent.

Phase names, spinners and timings shown in the UI are copy. They exist to make an asynchronous run legible. They only ever reflect what the session has reported: no advancing a phase on a timeout.

## Guard checks

The playbook states these as prose, and `scripts/run-guard.ts` (`pnpm check:run`, plus the `guards` GitHub Action on every PR) reports the ones that carry the core claim against `git diff <base>...HEAD`: the diff is the plan, the plan stays inside the allowed paths, and the plan never moved. The report is advisory: it is posted as a PR comment for the reviewing engineer and does not fail CI or stop the run. They have names, not numbers, so a PR comment reads as a sentence.


| Check                     | Fails when                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stays in plan**         | A file outside `plan.json ∪ runs/<run_id>/` is created, changed, renamed or deleted, or a planned file gets a different `op` than `plan.json` declares (a rename is a delete plus a create)             |
| **Plan stays in scope**   | A `plan.json` path matches none of the globs in `context.json`'s `allowed_paths`                                                                                                                        |
| **Run dir frozen**        | The plan commit (first on the branch) adds anything but `runs/<run_id>/context.json` and `plan.json`, or either file changes in a later commit, even if reverted afterwards (other files there, such as `replay.json`, may change)                |
| **Context untouched**     | `approve_pr` only: the branch's `context.json` doesn't hash (SHA-256) to `contextSha256` in the dispatch audit row. CI can't read the console's SQLite, so the console's own rule does this half           |
| **Shared code reported**  | Always passes. Names the shared paths the diff touched — `packages/`, `apps/console/drizzle/`, `apps/console/src/app/actions.ts`, shared components, `AGENTS.md` — or reports none, so the review knows whether CODEOWNERS pulls in more owners                      |

Three more rules are enforced by review, CODEOWNERS and the playbook rather than the script; the guard's report ends with a note saying so:

| Rule                      | Fails when                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Humans approve**        | The session merges without an approving review from someone other than itself, force-pushes, or pushes to the default branch                                                                          |
| **Engine owner approves** | A change under `packages/engine/`, `packages/db/`, `packages/db-core/`, `packages/db-write/`, `packages/permissions/` or `apps/console/drizzle/` merges without an approving review from the engine owner in CODEOWNERS, in addition to `approve_pr`                        |
| **No live writes**        | The session runs `pnpm db:setup` or `db:seed`, or writes SQL against anything but a test database                                                                                        |

Test counts, type escapes, seed edits and the shape of an undo are for the engineer's review; the PR lists per-file test counts and every rewritten test by name (see § Pull request contents).

`runs/` and the guard sit under CODEOWNERS, so changing either needs a human reviewer.
## Undo

An undo is not `git revert` run by a machine. A clean revert only works if nothing has touched the same lines since the merge. In practice other runs and ordinary PRs will have landed on top. An admin will have tuned the rule's constants. Refunds may still be in the Manager queue, routed by a rule that is about to disappear. Working through that is the autonomous part.

Devin's job on an undo:

1. Read the target's merge commit and every change merged since. Don't start from `git revert`: remove the target's effect by editing the code as it is now.
2. Keep every later change, including later changes in the same files, and list each one in the PR under **Kept** beside what was **Removed**.
3. Remove the constants that change declared. Restore any constant it changed to the value in its `context.json`, unless an admin has set it since. In that case, report both values in the PR and leave the declared default alone.
4. Rewrite, don't delete, any later test that depended on the undone rule. Name each one.
5. List in the PR anything the code can't undo: routed refunds still in the Manager queue, and constant rows still in the live database. These become operator steps.

## Snapshots

`runs/<run_id>/` holds `context.json` and `plan.json`. It holds no copies of source files. Git already holds every version exactly, and a second copy is a second source of truth that can drift. The directory merges with the PR, so `runs/` becomes the permanent record of every change the console asked for, and what the world looked like when it asked.

## Pull request contents

The sections Summary, Updates since last revision, Local testing results, and Review and Testing Checklist, plus:

- **Run:** run id, operation, base commit, plan commit, session link.
- **Intent:** the sentence as the requester wrote it.
- **Tests:** per-file counts before and after. Every new or rewritten test is named, with its reason.
- **Live state:** constants from `context.json` next to any declared default the PR changes.
- **After merge:** operator steps, such as paying or rejecting routed refunds. `record_merge` is written automatically; see § Approval and merge.



## Approval and merge

Humans approve and merge. The control a regulated change process needs is separation of duties: whoever wrote a change doesn't approve it. The engineer's merge on GitHub is that approval: a merge by the mapped engineer records their `approve_pr` first.

1. The PR opens. The run view shows **Review and approve** to anyone with the `engineer` role who didn't request the run.
2. The engineer approves in one of two places, and both record the same `approve_pr`:
   - **In the console.** The approval dialog (`AGENT_TRIGGER_SURFACE.md` § Approval dialog) lists the spec's acceptance tests as the reviewer's checklist; the engineer checks the PR's tests against it. `approve_pr` checks the rules above and writes the audit row. Its effect, after the commit, submits an approving review to GitHub (`POST /repos/{owner}/{repo}/pulls/{n}/reviews`, `event: APPROVE`) as the engineer. The approval is recorded once per head sha; retrying an approval whose GitHub review failed re-posts the review without a second audit row.
   - **On GitHub.** The console polls the PR's reviews while the run is `running`. An approving review at the head sha by the login `GITHUB_APPROVER_LOGIN` maps to (default `rmtandon1`, the `engineer` actor) runs `approve_pr` as that engineer with the same server-read `checksGreen` and `branchContextSha256`, the same idempotency key and the note `Approved on GitHub by @login`. The console's own review is not counted; an approval by an unmapped login is shown on the run but records nothing; a denial (requester, red checks, changed context) is shown the way the button shows it. No second review is posted.
3. The engineer merges on GitHub. Devin stopped at the pull request and is never told to merge.
4. The console writes `record_merge` for the same engineer, with the PR URL and merge commit. If the PR was merged on GitHub with no approval the console recorded, `record_merge` still runs from `running`, with `approvedBy` null and the note `Merged on GitHub without a recorded approval`. The run view shows when GitHub was last read (`Synced with GitHub · Ns ago`).

Enforcement lives in GitHub. Branch protection on `cognition-dashboard-devin-integration` requires one approving review, the four CI checks — Lint, Typecheck, Boundaries and Test — and no bypass for Devin's GitHub account. Devin's docs recommend exactly this: branch protection "to ensure all required checks pass before Devin can merge changes" (docs.devin.ai, GitHub integration). A security profile can also restrict the session's git and GitHub CLI access (docs.devin.ai, Security Profiles).

Demo setup: the engineer's GitHub token sits in the server environment next to `DEVIN_API_KEY`, with `GITHUB_APPROVER_LOGIN` naming the engineer's GitHub login when it is not `rmtandon1`.

## After merge

1. The console writes `record_merge` with the merge commit GitHub reports. That closes the run in the audit chain.
2. The local checkout pulls the sync branch (`SYNC_BRANCH`, default `cognition-dashboard-devin-integration`) as soon as the run's page next reads the merge, with no click. **Pull merged code** (admin) and **Reconcile** on `/t/automation` remain as fallbacks. The pull is refused on another branch or a dirty tree — except an untracked `runs/<id>/context.json` that hashes to the merged run's `contextSha256`, which dispatch itself wrote; that one is deleted and the merge recreates it. When the pull changes a `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml`, `pnpm install --frozen-lockfile` runs first, and retries on the next sync while the installed lockfile lags the checkout's. `pnpm db:migrate` runs whenever drizzle's journal has entries past `__drizzle_migrations`, and retries on the next sync if it fails. See `GITHUB_INTEGRATION.md` § Merge sync.
3. Constants a run declares must exist in the live database without a re-seed. `registerToolConstants` (`registerConstants`, which skips existing keys) runs on server start via `instrumentation.ts`, in-process right after the merge sync's `db:migrate`, and whenever `bootstrap.ts` is evaluated with newly pulled tool code, so a merged rule's setting appears without a restart. A production build still needs a rebuild to serve new source.
4. The next matching record goes through the new rule. That moment is the demo.

`db:migrate` here is the console migrating its own database after a merge, not a Devin session writing live data. `db:setup` and `db:seed` remain off limits for the session; the merge sync never invokes them.

## Credentials

`DEVIN_API_KEY` is read on the server from a gitignored repo-root `.env` (`apps/console/src/lib/env.ts`, `apps/console/src/lib/bridge.ts`) and never reaches the browser. The organisation comes from `GET /v3/self` unless `DEVIN_ORG_ID` overrides it, and the playbook titled "Governed console run" is looked up unless `DEVIN_PLAYBOOK_ID` names one. A missing playbook doesn't block a run, because the session prompt also names `.devin/run-protocol.playbook.md`. `GET /api/devin/status` reports the mode and organisation and never returns the key.

With the key set, the console dispatches, polls and terminates through the v3 API. If the session can't be created, `dispatch` still applies and `record_session` records the error, so the run lands as `dispatch_failed` with its audit rows.

Without the key, Devin is **not connected**. The Devin window and the "Ask Devin for a rule" button say `Devin not connected`. `dispatchAutomationRun` refuses, so a run that never happened never reaches `devin_runs` or the audit chain.
