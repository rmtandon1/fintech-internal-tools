# Devin Run Protocol

## Summary

- A business rule in this console is code. Devin adds, changes or removes it in a run, and a person approves every merge.
- Feature specs (`REFUND_CLUSTERING_HOLD.md`, `PRIVILEGED_ACTION_JUSTIFICATION.md`) supply each run's intent, scope and acceptance tests.
- Starting a run is a governed write, like any other action. Each run appears in the audit chain four times, when it is requested, picked up, approved, and merged.
- The console hands Devin a context file with the live settings and evidence, without customer data. Devin commits its plan before its first edit, and security checks in CI hold the diff to that plan.
- An engineer approves, then Devin merges.
- A reversal removes one earlier change from the code as it is now, keeping everything merged since.
- Switching a rule off is a setting change on `/admin/policy`, in seconds, with no run.
- Runs are live when the server has a Devin API key, and a labelled replay when it doesn't.



## The model

A business rule in this console is code. When risk wants a rule changed, Devin changes the code. When risk wants it gone, Devin takes it out. There is no feature flag in between, and no dead branch left waiting for cleanup.

That puts two requirements on every run. It must be as safe to undo as it was to make. And the undo must work on the codebase as it is at undo time, not as it was when the change merged.

## Run kinds


| Kind                      | What it does                                                       | Who starts it                                                   | Devin session? |
| ------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | -------------- |
| `IMPLEMENTATION/ADDITION` | Adds a rule, with its constants and tests                          | Manager of the domain whose context shows the problem, or admin | Yes            |
| `IMPLEMENTATION/CHANGE`   | Changes what an existing rule decides, not just its threshold      | Manager of the rule's domain, or admin                          | Yes            |
| `IMPLEMENTATION/REMOVAL`  | Removes a rule, its constants and the tests that assert it         | Admin                                                           | Yes            |
| `REVERSAL`                | Undoes one earlier IMPLEMENTATION, keeping everything merged since | Admin                                                           | Yes            |


Moving a threshold or switching a rule off is a setting change on `/admin/policy`, in seconds and audited. A run is for changes a setting can't express.

### Scope

The kind says what a run does. Its scope says where it may do it, and so how much review it needs. Engine scope exists for the reason-and-ticket change (`PRIVILEGED_ACTION_JUSTIFICATION.md`).


| Scope            | May change                                                                                      | Extra gate                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `rule` (default) | Tool folders, tests, `runs/`                                                                    | None. **Engine untouched** applies                                                                                        |
| `engine`         | Also `packages/engine/`, `packages/db/`, `packages/db-core/`, `packages/db-write/`, `packages/permissions/`, `apps/console/drizzle/`, `apps/console/src/app/actions.ts`, shared components, `AGENTS.md` | The engine owner approves as well as the engineer. The reviewer runs `/audit/verify` on a database migrated to the branch |


Only an admin may dispatch a run with engine scope.

### Switching a rule off in seconds (KILL_SWITCH)

Every rule a run adds reads its thresholds from admin-editable constants, and its spec names one value that makes the rule inert. For the clustering hold, that is a window of 0 days. The admin sets it on `/admin/policy`: immediate, audited, and no flag in the code. It covers the minutes a REVERSAL takes to open and be approved, while the rule may be holding genuine refunds. The REVERSAL then removes the rule from the code.

Policy rules use constants, and product flags such as `payments.card_network_failover` stay flags, governed by the console. Reasoning: `CHANGE_TYPES.md` › Policy rules and product flags.

## Starting a run is a governed write

Dispatch goes through `executeIntent` like every other write. A small `automation` tool (`tools/automation/`) owns a `devin_runs` table and five actions: `dispatch`, `record_session`, `approve_pr`, `record_merge` and `stop`.

`dispatch` rules:

- The role may start this kind (table above).
- No other run is in flight against the same tool.
- A REVERSAL names a merged IMPLEMENTATION that has not already been reversed.
- An IMPLEMENTATION carries evidence, such as a non-empty cluster.

The effect writes the run row and the audit row in one transaction. The HTTP call to Devin happens after the commit, never inside it. `record_session` then stores the session id. If the call fails, the run row is marked `dispatch_failed` through the same intent path.

`approve_pr` rules:

- The actor is an `engineer`. This is a new role, added to `ROLES` and `ROLE_META` in `packages/permissions/src/roles.ts` and `DEMO_ACTORS` in `packages/engine/src/actor.ts` by the build agent, with a level `canApprove` excludes (`AGENT_TRIGGER_SURFACE.md` § Build). It is not a Devin run.
- The approver is not the run's requester.
- The PR's required checks are green, including every guard check.

Its effect submits an approving review to GitHub as the engineer, then messages the Devin session to merge. See § Approval and merge.

Every run therefore appears in the hash chain four times: when it was asked for, when Devin picked it up, when an engineer approved it, and when it merged.

## What the console hands Devin

Devin's VM runs a freshly seeded database. It cannot see `apps/console/data/console.db`, where live constants, held refunds and admin edits live. So the console captures that state at dispatch and hands it over. Devin never reads the live database, and never has to guess it.

`runs/<run_id>/context.json` is written by the console and passed as a session attachment:

```json
{
  "run_id": "01K5Z3Q8M4V7N2X9C6B1D0F3GH",
  "kind": "IMPLEMENTATION/ADDITION",
  "spec": "REFUND_CLUSTERING_HOLD.md",
  "intent": "Hold a merchant's not-received refunds once together they pass the manager line, and send those customers' KYC approvals to a manager.",
  "requested_by": "refunds_manager",
  "base": { "branch": "cognition-dashboard-devin-integration", "commit": "1a67f60…" },
  "constants": {
    "refunds.manager_approval_usd_minor": 50000,
    "kyc.manager_review_score": 70
  },
  "evidence": {
    "cluster": "merchant_not_received:Kestrel Outdoors",
    "rows": [
      { "id": "rfnd_0011", "merchant": "Kestrel Outdoors", "reasonCode": "not_received", "usdMinor": 48000, "requestedAt": "2026-09-20T09:12:00Z" }
    ]
  },
  "reverses": null,
  "audit_head": { "seq": 214, "rowHash": "e3b0…" }
}
```

- **Evidence rows carry no PII.** Emails and card numbers are dropped, not masked. Devin needs the amounts, merchant, reason and timing to write a regression test. It doesn't need the customer.
- **The dispatch audit row stores the SHA-256 of this file.** The guard checks that the file committed on the branch hashes to the same value, so what Devin worked from is provably what the console sent.
- **For a REVERSAL**, `reverses` names the IMPLEMENTATION's run id and merge commit. `constants` then carries both the values at that IMPLEMENTATION's dispatch and the values now.

The session itself gets:

- `playbook_id`: the Devin playbook holding this protocol.
- `prompt`: the intent sentence, the kind, and the spec path.
- The attachment above.
- `structured_output_schema`: see § Progress.
- `max_acu_limit`: the run's budget.
- `tags`: `run:<run_id>`, `kind:<kind>`.

It never gets reference code. Specs include a reference implementation for the reviewer, and Devin works out its own.

## Phases

Each phase passes or stops the run. There is no "continue with warnings".


| Phase        | Passes when                                                                                                                                                  | On failure                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Intake       | The spec exists. The context file parses. Its base commit is the branch head, or the run rebases cleanly                                                     | Stop. No branch is created                                                                                     |
| Baseline     | `pnpm verify` is green at the base commit. Per-file test counts are recorded                                                                                 | Stop. No branch is created                                                                                     |
| Plan         | `runs/<run_id>/context.json` (verbatim) and `runs/<run_id>/plan.json` (the files Devin will touch, and why) are committed alone as the branch's first commit | Stop. Delete the branch                                                                                        |
| Edit         | Only files in the plan change                                                                                                                                | Reset to the plan commit and stop                                                                              |
| Verify       | `pnpm verify` is green. The spec's acceptance tests pass. Test counts per file are at or above baseline                                                      | Two fix attempts inside the plan, then reset and stop                                                          |
| Pull request | A PR is opened against `cognition-dashboard-devin-integration`                                                                                                    | Leave the branch pushed and report                                                                             |
| Merge        | After an engineer's `approve_pr`, Devin merges (squash) and reports `merge_commit`                                                                           | Report why (checks re-running, conflict with a newer merge) and wait. Rebase inside the plan if the base moved |


The plan is Devin's own, committed before any edit. The spec gives a scope the plan must stay inside. Committing first is what makes scope checkable: the guard compares the diff with a list Devin wrote before it knew what the diff would be.

`plan.json` holds `files[]` (path, `create | modify | delete`, one-line reason), `reuses[]` (existing modules the change builds on, each with a one-line reason) and `acceptance[]` (the spec's acceptance test names it will make pass). `reuses[]` is informational. No guard checks it, and it is not a scope boundary.

## Progress

The Devin API doesn't stream sub-steps. The session's `structured_output` is the channel. The playbook tells Devin to update it at each phase boundary, and to append sub-events as each one completes, so the run view (`AGENT_TRIGGER_SURFACE.md` § The run view) shows artifacts rather than counts:

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
    { "module": "packages/engine/src/approvals.ts", "reason": "held refunds go to the existing manager tier" },
    { "module": "packages/engine/src/audit", "reason": "every hold decision is an audit row" }
  ],
  "files": [
    { "path": "tools/refunds/src/clustering-hold.ts", "op": "create", "additions": 84, "deletions": 0, "reason": "clustering_hold rule and shared cluster query" },
    { "path": "tools/kyc/src/index.ts", "op": "modify", "additions": 12, "deletions": 1, "reason": "linked_refund_hold on approve" }
  ],
  "verify_steps": [
    { "name": "lint", "pass": true },
    { "name": "typecheck", "pass": true },
    { "name": "boundaries", "pass": true },
    { "name": "tests", "pass": null, "before": 68, "after": null }
  ],
  "guards": [
    { "name": "Stays in plan", "pass": true },
    { "name": "Engine untouched", "pass": true }
  ],
  "conflicts": [],
  "pr_url": null,
  "stopped_by": null
}
```

- `reuses` is copied from `plan.json` when the Plan phase lands and does not change after. It drives the "Reusing …" lines of the run checklist.
- `files` fills during Edit. Before that, the plan's paths come from `plan.json`.
- `guards` is Devin's local run of `scripts/run-guard.ts`. The same checks run again in CI on the PR, and CI is the authority.
- `conflicts` is used by REVERSAL: one entry per conflicted file, with what was kept (`"partial_delivery reason code, PR #7"`) and what was removed (`"clustering_hold registration"`).

The console polls the session (`GET /v3/organizations/{org_id}/sessions/{devin_id}`) and reads `status`, `status_detail` and `structured_output`. `status_detail = waiting_for_user` surfaces as a reply box, and the reply is sent through the messages endpoint. **Stop run** calls the terminate endpoint (`DELETE` on the same path) and marks the run `stopped` through an intent.

Phase names, spinners and timings shown in the UI are copy. They exist to make an asynchronous run legible. In live mode they only ever reflect what the session has reported: no advancing a phase on a timeout. In replay mode the recorded `structured_output` sequence plays on a compressed timer, paced for camera. That is acceptable because the architecture underneath is real. The one rule: a replay says it is a replay.

## Guard checks

The playbook states these as prose, and `scripts/run-guard.ts` (in `pnpm verify`, plus a GitHub Action on every PR) enforces them against `git diff <base>...HEAD`. They have names, not numbers, so a PR comment reads as a sentence.


| Check                     | Fails when                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stays in plan**         | A file outside `plan.json ∪ runs/<run_id>/` is created, changed, renamed or deleted                                                                                                                   |
| **Plan stays in scope**   | `plan.json` names a file outside the spec's scope                                                                                                                                                     |
| **Context untouched**     | `context.json` doesn't hash to the value in the dispatch audit row, or `runs/<run_id>/` changes after the plan commit                                                                                 |
| **Engine untouched**      | Scope `rule` only. Anything under `packages/engine/`, `packages/db/`, `packages/db-core/`, `packages/db-write/`, `packages/permissions/`, `apps/console/drizzle/`, `scripts/check-boundaries.ts`, the guard itself, `AGENTS.md`, `package.json` or `pnpm-lock.yaml` changes                      |
| **Tests never shrink**    | A test file is deleted, a file's `it(` count drops, or `.skip`, `.only` or `.todo` appears. A REMOVAL or REVERSAL may delete tests that assert the rule it takes out, but only if the plan names them |
| **No type escapes**       | New `any`, `@ts-ignore`, `eslint-disable` or `as unknown as`                                                                                                                                          |
| **Seed is not state**     | A seed file changes to fake a demo outcome. Seeds may gain rows the spec asks for                                                                                                                     |
| **Humans approve**        | The session merges without an approving review from someone other than itself, force-pushes, or pushes to the default branch                                                                          |
| **Engine owner approves** | Scope `engine` only. A change under `packages/engine/`, `packages/db/`, `packages/db-core/`, `packages/db-write/`, `packages/permissions/` or `apps/console/drizzle/` merges without an approving review from the engine owner in CODEOWNERS, in addition to `approve_pr`                        |
| **No live writes**        | The session runs `pnpm db:setup`, `db:seed` or `db:tamper`, or writes SQL against anything but a test database                                                                                        |


`runs/` and the guard sit under CODEOWNERS, so changing either needs a human reviewer.

## Reversal

A REVERSAL is not `git revert` run by a machine. A clean revert only works if nothing has touched the same lines since the merge. In practice other runs and ordinary PRs will have landed on top. An admin will have tuned the rule's constants. Refunds may be sitting in the inbox, held by a rule that is about to disappear. Working through that is the autonomous part.

Devin's job on a REVERSAL:

1. Start from `git revert -m 1 <merge_commit>` on a fresh branch.
2. Resolve conflicts so that the reversed IMPLEMENTATION's effect is gone, and every later change stays.
3. Remove the constants that IMPLEMENTATION declared. Restore any constant it changed to the value in its `context.json`, unless an admin has set it since. In that case, report both values in the PR and leave the declared default alone.
4. Rewrite, don't delete, any later test that depended on the reversed rule. Name each one.
5. List in the PR anything the code can't undo: held refunds still awaiting approval, and constant rows still in the live database. These become operator steps.

The extra guard check for REVERSAL is **Only undo**. For every file the original IMPLEMENTATION touched, `git diff <implementation_base> HEAD -- <file>` must contain only changes from commits merged after that IMPLEMENTATION. Anything else is new behaviour smuggled into an undo.

## Snapshots

`runs/<run_id>/` holds `context.json` and `plan.json`. It holds no copies of source files. Git already holds every version exactly, and a second copy is a second source of truth that can drift. The directory merges with the PR, so `runs/` becomes the permanent record of every change the console asked for, and what the world looked like when it asked.

## Pull request contents

The sections from `AGENTS.md` (Summary, Updates since last revision, Local testing results, Review and Testing Checklist), plus:

- **Run:** run id, kind, spec, base commit, plan commit, session link.
- **Intent:** the sentence as the requester wrote it.
- **Tests:** per-file counts before and after. Every new or rewritten test is named, with its reason.
- **Live state:** constants from `context.json` next to any declared default the PR changes.
- **After merge:** operator steps, such as clearing held refunds. `record_merge` is written automatically; see § Approval and merge.



## Approval and merge

Humans approve. Devin merges. The control a regulated change process needs is separation of duties: whoever wrote a change doesn't approve it. The approval is the control, not the merge click, so Devin can do the click.

1. The PR opens. The run view shows **Review and approve** to anyone with the `engineer` role who didn't request the run.
2. The engineer opens the approval dialog (`AGENT_TRIGGER_SURFACE.md` § Approval dialog) and approves. `approve_pr` checks the rules above and writes the audit row.
3. Its effect, after the commit, submits an approving review to GitHub (`POST /repos/{owner}/{repo}/pulls/{n}/reviews`, `event: APPROVE`) as the engineer, and sends the Devin session a message to merge.
4. Devin merges and reports `merge_commit` in `structured_output`.
5. The console writes `record_merge` for the same engineer, with the PR URL and merge commit.

Enforcement lives in GitHub, not the guard script. `run-guard.ts` checks a diff and can't see who merged. Branch protection on `cognition-dashboard-devin-integration` requires one approving review, all guard checks, and no bypass for Devin's GitHub account. Devin's docs recommend exactly this: branch protection "to ensure all required checks pass before Devin can merge changes" (docs.devin.ai, GitHub integration). A security profile can also restrict the session's git and GitHub CLI access (docs.devin.ai, Security Profiles).

Demo setup: the engineer's GitHub token sits in the server environment next to `DEVIN_API_KEY`. In replay, steps 3–5 play from the fixture.

## After merge

1. The console writes `record_merge` with the merge commit Devin reports. That closes the run in the audit chain.
2. The local checkout pulls the default branch (`git pull --ff-only`). `next dev` reloads the changed modules.
3. Constants a run declares must exist in the live database without a re-seed, so the app registers declared constants on start. `registerConstants` already skips existing keys. Today it only runs from `apps/console/scripts/seed.ts`.
4. The next matching record goes through the new rule. That moment is the demo.



## Live and replay


| Mode   | When                                                     | What the console does                                                                                                          |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Live   | `DEVIN_API_KEY` and `DEVIN_ORG_ID` are set on the server | Dispatches, polls and terminates through the v3 API. The key never reaches the browser                                         |
| Replay | No key                                                   | Plays back a run fixture: a `structured_output` sequence, a PR, an approval and a merge. Labelled "Replay" wherever it appears |


A replay can be a recorded real run or a scripted one, as long as it is labelled "Replay". Live mode only ever shows what the session reports.

Only a recorded or live run appears on camera. A scripted replay is for building the run view before a real run exists.