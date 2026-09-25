# Governed console run

## Overview
Execute one console-requested code change from an attached context file. Follow `docs/DEVIN_RUN_PROTOCOL.md` and the named feature spec. An engineer must approve before merge.

## What's needed from the console
- An attached `context.json` with the run id, kind, spec, intent, base branch and commit, scope, constants, evidence, and optional reversal target.
- A repository checkout at the integration branch and permission to open a PR against it.

## Procedure

1. **Intake.** Read `AGENTS.md`, the protocol, the spec named in the attachment, and the complete attached `context.json`. Do not read any section headed “Reference implementation (reviewer only)”. Validate the attachment against the `ContextFile` schema in `tools/automation/src/run-files.ts`; hash its exact bytes with SHA-256. Check its base branch and commit against the current integration head. If the head moved, reconcile by a clean rebase before planning; if the spec, context, or base cannot be reconciled, stop without creating a branch.
2. **Baseline.** At the reconciled base, run `pnpm verify` and record the count and names of `it(...)` tests per file. If any gate fails, stop without creating a branch. Never alter live state to make a gate pass.
3. **Plan.** Create `devin/<run_id>-<slug>` from the verified base. Plan only files matching the attachment's scope; for a rule run leave engine paths untouched. Write `runs/<run_id>/context.json` using the attachment's exact bytes and `runs/<run_id>/plan.json` using `PlanFile`: `files[]` (path, create/modify/delete, reason), `reuses[]` (module, reason), `acceptance[]` (spec test names), and `removed_tests[]` only for REMOVAL or REVERSAL. Commit *only these two files* as the first commit. Record its hash; if planning fails, delete the unpushed branch and stop.
4. **Edit.** Implement the spec within the planned files only, reusing the planned modules and the existing intent/approval/audit paths. Add or rewrite tests for every behavior. After **each edit**, update the structured output with the changed file's operation, additions, deletions and reason. If a file outside the plan changes, restore to the plan commit and stop.
5. **Verify.** Run `pnpm verify`, including `scripts/run-guard.ts`, then run the spec's acceptance tests. Compare each test file's count and names with the baseline; only `removed_tests[]` may disappear for REMOVAL or REVERSAL, and never delete a test file. Report each gate's result and the guard's named results. Fix failures at most twice, strictly inside the plan, rerunning the full gate each time. If still failing, restore to the plan commit and stop.
6. **Pull request.** Push only the run branch and open a PR against `cognition-dashboard-devin-integration`. Use the sections Summary, Updates since last revision, Local testing results, Review and Testing Checklist from `AGENTS.md`, plus **Run** (id, kind, spec, base commit, plan commit, session link), **Intent** (requester's exact sentence), **Tests** (before/after counts per file, each added or rewritten test and why), **Live state** (context constants beside changed defaults), and **After merge** (operator steps and live effects code cannot undo). Leave the branch pushed and report if opening fails.
7. **Merge.** Wait for a message *from the console* that an engineer approved through `approve_pr` and for green required checks and approving GitHub review(s), including the engine owner for engine scope. Only then squash-merge; record the actual merge commit. If checks rerun or a new merge conflicts, report and wait, reconciling within the plan if necessary.

## Reversal
For REVERSAL, start from the target implementation's merge commit on a fresh branch: use `git revert -m 1 <merge_commit>` for a merge commit, or `git revert <merge_commit>` for a squash commit, as a starting patch; then preserve all later merged work while removing only the target's effect. Keep all resolution edits within the plan. Remove constants the implementation declared; restore changed constants from the old context unless an admin has changed their live value since, in which case report both values and leave the declared default alone. Rewrite later tests that depend on the removed rule and list them. Record each conflict with what was kept and removed. Check **Only undo** against the original implementation base and name held records and live constant rows requiring operator action in the PR. The plan files must still be the branch's first commit; perform the revert only after that commit.

## Structured output
Use the `StructuredOutput` schema in `tools/automation/src/run-files.ts` for **every** update, including initial and stopped states. Set `phase` to intake, baseline, plan, edit, verify, pull_request, or merge; set `phase_status` to running, done, stopped, or waiting_for_user. Populate `phase_durations_s` with elapsed seconds at each phase boundary. At Plan, copy `reuses` from the committed plan and set `base_commit`, `context_sha256`, `branch`, and `plan_commit`. During Edit append/update `files` after each edit. During Verify append results to `verify_steps` and `guards` as each check completes. For REVERSAL populate `conflicts` during resolution. Set `pr_url` after opening the PR, `merge_commit` after squash merge, and `stopped_by` with the reason when stopped. Supply nulls or empty arrays for fields without results yet; retain prior artifacts on later updates. Update at phase boundaries and after each edit or completed sub-event, never on a timer.

## Local guard checks
Report the exact names printed by `scripts/run-guard.ts` in the `guards` results: **Stays in plan**, **Plan stays in scope**, **Run dir frozen**, **Engine untouched**, **Tests never shrink**, **No type escapes**, **Seed is not state**, and, for REVERSAL, **Only undo**. The console separately checks **Context untouched**; GitHub enforces **Humans approve** and **Engine owner approves**; never perform **No live writes**. The guard evaluates the code diff and cannot attest to external approval or live database state.

## Specifications
- No branch is created if Intake or Baseline fails. The first run-branch commit contains exactly the two run files, and their contents never change afterwards.
- The final diff touches only planned files and the run directory; changes comply with scope, named guard checks, acceptance tests and baseline counts. CI is authoritative for guard results.
- A PR awaits an engineer's console approval; report the merge commit only after the squash merge actually succeeds.

## Forbidden actions
- Never run `pnpm setup`, `pnpm db:seed`, `pnpm db:tamper`, or `pnpm db:scenario`; never write to a live database or read reviewer-only reference code.
- Never force-push, push to the integration branch, approve your own PR, or merge before the console sends engineer approval.
