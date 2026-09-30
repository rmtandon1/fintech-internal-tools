# Governed console run

## Overview
Make one change the console asked for and open a pull request for an engineer. The brief is the requester's sentence in the prompt and the attached `context.json`. Work out what the sentence leaves unsaid from the code and its tests, and write a test for each answer. An engineer reviews and merges the pull request on GitHub. You never merge.

## Procedure
1. **Intake.** Read the attached `context.json`: the sentence, operation, evidence, live settings, allowed paths, base branch and commit, and for an undo the target run. Read only the code you need. Don't read `README.md` or anything under `docs/` unless the prompt names a spec. If the base branch has moved past the context's commit, start from its current head.
2. **Baseline.** Run `pnpm verify` at the base and record the total test count. If a gate fails, stop.
3. **Plan.** Create `devin/<run_id>-<slug>` from the base. Grep the tests for the rule list, rule ids and trace names you will touch, so you know which existing tests move. Write `runs/<run_id>/context.json` from the attachment's exact bytes (the console checks its hash) and `runs/<run_id>/plan.json` using `PlanFile` in `tools/automation/src/run-files.ts`: `files[]` (path, create/modify/delete, reason), `reuses[]` (existing modules you build on), `acceptance[]` (the tests you will write, one per behaviour), and `removed_tests[]` only for an undo. Commit only these two files as the first commit, and never edit them afterwards. Keep this step to a few minutes: plan from the rules and tests the change touches, not a survey of the codebase.
4. **Edit.** Change only planned files under the allowed paths, reusing the existing intent, approval and audit paths. Add or rewrite a test for every behaviour. Update `files` after each edit. If a file outside the plan has to change, change it, add it to `files` with the reason and say so in a note; the guard reports it for the reviewer.
5. **Verify.** Run `pnpm verify`, then `pnpm check:run` and report its named checks in `guards`. The guard is advisory: a failed check is reported for the reviewer, not a stopped run. Keep one `verify_steps` entry per gate, named `Lint`, `Typecheck`, `Boundaries` and `Test` (`Test` carries `before` and `after`), updated in place so each shows its final result. Fix failures at most twice; then stop and name the gate in `stopped_by`.
6. **Pull request.** Push the run branch and open a pull request against the base branch in `context.json`.
   - **Title**: Conventional Commits, `feat(<tool>): …` for a change and `revert(<tool>): remove <rule name>` for an undo. Lower case, under 70 characters.
   - **Description**: only 2 to 5 bullets, one plain sentence each, saying the intended outcome of the change and why. Nothing else, because GitHub uses the title and description as the squash-merge commit.
   - **Reviewer comment**: straight after opening the pull request, post one pull request comment holding everything for the reviewer. Its first line is the console link line from the prompt, `▶ [Open this change in the console](<link>)`, then:
     - **Intent**: the requester's exact sentence.
     - **Judgement calls**: each thing the sentence left open and what you chose, for the reviewer to confirm.
     - **Tests**: before and after counts, and each added or rewritten test with why.
     - **After merge**: what an operator does next, such as switching the rule on.
     - For an undo, **Removed** and **Kept** as well (see Undo).
7. **Merge.** Don't merge. Set `phase` to `merge` and `phase_status` to `waiting_for_user`, and stop. The engineer merges on GitHub and the console records it. If you are asked for changes, make them on the same branch and verify again.

## Undo
An undo removes one earlier change, the target in `context.json`, from the code as it is now. Don't start from `git revert`. Read the target's merge commit (`git show <merge_commit>`) and every commit merged into the base branch since (`git log <merge_commit>..HEAD`). After the plan commit, remove only what the target added (its rules, settings, tests, links and copy) by editing the current code, and keep every later change, including later changes in the same files. Record in `conflicts` each file where later work sits beside the target's code, with what you kept and what you removed. In the reviewer comment, list **Removed** (each rule, setting and test) and **Kept** (each later pull request that touched the same files, and what of it stayed), and name the records the removal releases, such as refunds that return to the analyst queue.

## House rules
- **One write path.** Every write goes through `executeIntent` from a tool action; opening a page writes nothing. `pnpm check:boundaries` fails anything else.
- **Off until someone turns it on.** A new rule or check that changes decisions reads a switch setting the tool declares in its `constants`: a boolean, false by default; while it is false nothing changes. Use the name the prompt gives after `Switch setting:`, otherwise `<tool>.<snake_case_name>`. Its description is one plain sentence saying what the rule does when it is on, with no units and no mention of a value that switches it off. A manager or admin turns it on after the merge.
- **Outside services.** Read the provider's API docs on the web first. The client lives in the tool that uses it. Its key comes from `<SERVICE>_API_KEY` on the server, is documented in `.env.example`, and is never logged or sent to the browser. One call per action, with a timeout of at most five seconds.
- **Failure holds, never passes.** A lookup that times out, errors or finds nothing shows "couldn't check" and needs a person, like a material difference.
- **Recorded responses.** Tests never call a live service; they replay recorded responses, recorded from the live service when the session has the key. Without the key at runtime the console uses the recordings and labels the result "test data". Never invent a response for a seeded record.
- **Links between tools.** A record that relates to another tool's record shows it through the tool declaration's `linkedActivity`.
- **Admin triggers.** An action an admin starts by hand, such as a recheck, is declared in the tool's `adminActions`, so it appears in the Rules panel on the tool's page.
- **No customer data.** No names, emails, card numbers or documents in trace reasons, notes or the pull request.
- **Tests stay honest.** Never delete or shrink a test file, and never add `.skip`, `.only`, `.todo`, `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` or `as unknown as`.

## Progress messages
When a step ends, first update structured output for that step, then post one chat message: `Step N of 7 complete: <result>`. The result is plain English for an ops manager, under 15 words, with no file names, hashes, branches, run ids or code identifiers. For example: `Step 3 of 7 complete: Planned the rule and the two tests it needs.` If a step stops, post `Step N of 7 stopped: <reason>`, worded the same way. For step 7 post `Step 7 of 7: Waiting for an engineer to merge pull request #<number> on GitHub.` You may post these alongside other work. Post nothing else unless you are blocked.

## Structured output
Use the `StructuredOutput` schema in `tools/automation/src/run-files.ts` for every update, including the first and a stopped one. Set `phase` (intake, baseline, plan, edit, verify, pull_request, merge), `phase_status` (running, done, stopped, waiting_for_user), and `phase_durations_s` at each phase boundary. At Plan, set `base_commit`, `context_sha256`, `branch` and `plan_commit`, and copy `files` and `reuses` from the plan. Update `guards` as each check completes. Add to `notes` one short, plain sentence for each thing you did that the other fields don't show, tagged with its phase. For an undo, fill `conflicts`. Set `pr_url` when the pull request opens. Keep earlier values on later updates, and use nulls and empty arrays for fields with no result yet. Update at each phase boundary, before posting that step's message, and after each edit; never on a timer.

## Forbidden
- Never run `pnpm setup`, `pnpm db:seed`, `pnpm db:reset` or `pnpm db:scenario`, and never write to a live database.
- Never force-push, push to the base branch, or approve or merge your own pull request.
