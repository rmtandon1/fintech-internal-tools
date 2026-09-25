# Agent Trigger Surface

## Summary

- A Devin run starts from the screen that shows why it is needed: the cluster drawer, a rule's row, or a merged run. The request carries that screen's evidence with it.
- The handoff panel holds one editable sentence, plus the evidence, scope and mode the system fills in. The requester sees exactly what Devin will see.
- The run view shows the artifacts an engineer would check: planned files, lines changed, test counts and each guard check by name. The finished run is the still the demo pauses on.
- The approval dialog is where the human gate shows: an engineer who didn't request the run approves, then Devin merges.
- Run mechanics live in `DEVIN_RUN_PROTOCOL.md`. This file covers the UI around them.

## Where each run starts

A run starts from the screen that shows why it is needed, so the request carries its evidence with it.

| Kind | Starts from | Button | Role |
|---|---|---|---|
| `IMPLEMENTATION/ADDITION` | Cluster drawer on `/t/refunds` | **Ask Devin for a rule** | `refunds_manager`, admin |
| `IMPLEMENTATION/CHANGE` or `/REMOVAL` | A rule's row in the policy trace, or `/admin/policy` | **Ask Devin to change this rule** / **to remove this rule** | Manager of the rule's domain, admin (removal: admin) |
| `REVERSAL` | A merged run in `/runs` | **Reverse this change** | Admin |
| Switch a rule off (`KILL_SWITCH`) | `/admin/policy`, on the rule's off setting | The existing constant editor | Admin |

Switching a rule off uses the existing constant editor. The rule's spec names which constant, at which value, turns it off.

**Button labels.** Each button starts with "Ask Devin", because the operator sends one sentence and the result comes later, after review.

## The handoff panel

It opens in the right-hand agent column (`OPERATOR_CONSOLE_LAYOUT.md`) and holds:

- **Intent**: one sentence, prefilled from the spec and editable. This is the only free text in the flow.
- **Evidence**: what goes into `context.json`: cluster rows with PII dropped, the live constants the rule depends on, and the base commit. It is shown so the requester sees exactly what Devin will see.
- **Scope**: the files the spec allows, read-only.
- **Mode**: "Live" when the server has a Devin key, "Replay" otherwise.
- **Start run**: submits `automation.dispatch`. A policy denial shows in the standard `PolicyTrace`, for example "a run is already in flight on refunds".

Once the run starts, the same column becomes the run view.

**Grouped layout.** The fields sit in four groups: REQUEST (the intent, the one editable field) and three blocks the system fills in: CONTEXT (evidence, constants, base commit, no PII), GUARDRAILS (the allowed files) and EXECUTION (mode, start). It shows without narration that the operator writes one sentence and the system supplies the rest. Two requirements:

1. The group headers don't push the evidence line below the fold (see On camera).
2. The GUARDRAILS caption reads "CI fails anything outside the plan", not "outside this scope". CI checks the plan Devin commits. The scope is the outer bound that plan must fall within.

## On camera

This panel carries three lines of the demo pitch (`CUSTOMER_FRAMING.md` § 4), so it has to make both visible without narration:

- **"This is everything Devin sees."** The evidence block shows the four Kestrel amounts, the $500 and score-70 lines and base commit `1a67f60`, and no email or card number. If the presenter has to scroll to prove the PII is absent, the panel is too long.
- **"CI fails anything outside the plan."** When the Plan phase lands, the run view lists the five planned paths, not just a count, so the viewer sees the commitment before the first edit.
- **"Devin didn't just add a threshold."** The finished run view shows every file with its +/− lines, `pnpm verify` split into its four steps, and each guard check passing by name. The presenter points at it instead of listing files from memory.

## The run view

The run view is the demo's evidence that Devin did real engineering work. It shows the artifacts a reviewing engineer would check, not a spinner. The frame to design for is the **finished run**: the presenter pauses on it, and it has to carry the "name every file Devin touched" line with no narration.

### Operator summary (top)

- The intent sentence, the requester and the run kind.
- Status: running phase, `waiting_for_user`, PR open, merged, or stopped.
- What changes once merged, in business terms: "Refunds that take a merchant's `not_received` total past the manager line go to the manager inbox."
- **Stop run**, **Open in Devin**, and the **Reply box** while `status_detail` is `waiting_for_user`. The reply goes to the session's messages endpoint and is recorded on the run.

### Run checklist (between the two)

A glyph checklist that summarises the run in one glance: `✓` done, `●` running, `○` waiting. Every line reads from `structured_output` (`DEVIN_RUN_PROTOCOL.md` § Progress). In live mode a line advances only when the session reports it, never on a timer. Lines are named artifacts, not generic activity:

```
✓ Inspecting architecture         intake · base 1a67f60
✓ Baseline green                  68 tests
✓ Reusing engine intent pipeline  packages/engine/src/execute-intent.ts
✓ Reusing manager approval tier   packages/engine/src/approvals.ts
● Editing refunds/clustering-hold.ts  +84
○ Running guards                  Engine untouched · No type escapes · Seed is not state
○ Tests                           68 → 76
○ Opening pull request
```

- **Reusing lines** come from `reuses[]` in `plan.json`, so they appear when the Plan phase lands. They show the change sitting on the existing engine rather than beside it.
- **Editing** shows the file currently being written, from the newest entry in `files[]`.
- **Running guards** and **Tests** expand to the guard names and `verify_steps[]` the timeline below already shows. The checklist is the summary, the timeline stays the evidence.
- A REVERSAL swaps the reuse lines for `✓ Reverting <merge>` and `✓ Resolving conflict in <file>`.

The checklist is a second reading of the same fields as the timeline, not a second data source. If a line has no field behind it, cut the line.

### Engineering detail (below; open by default in the demo, collapsible in the product)

One timeline, one row per phase, each with a state (waiting, running with spinner, done with check, stopped) and a duration. Sub-events appear under each phase as `structured_output` reports them:

- **Intake:** spec path, base branch and commit `1a67f60`, `context.json` SHA-256 (first 8 characters, matching the dispatch audit row).
- **Baseline:** `pnpm verify` green at base, 68 tests.
- **Plan:** branch `devin/<run_id>-clustering-hold`, plan commit SHA, and the planned paths with `create` or `modify` and a one-line reason each.
- **Edit:** per file, +/− lines and the symbol touched, e.g. `tools/kyc/src/index.ts · modify · +12 −1 · linked_refund_hold on approve`.
- **Verify:** `pnpm verify` split into lint, typecheck, boundaries and tests (68 → 76), then each guard check by name with its result: **Stays in plan**, **Plan stays in scope**, **Context untouched**, **Engine untouched**, **Tests never shrink**, **No type escapes**, **Seed is not state**. For a REVERSAL, **Only undo** as well.
- **Pull request:** PR number and title, link to GitHub.

For a REVERSAL, two more things show:

- **What it reverses**, at the top: the original run id, its intent, its merge commit and PR, each linked. This is where the operator sees what "undo" refers to. Git and `runs/<run_id>/` hold the previous state, so there is no separate backup to show.
- **The conflict**, as its own Edit sub-event: `git revert -m 1 <merge>` → conflict in `tools/refunds/src/index.ts` → kept `partial_delivery` (PR #n), removed `clustering_hold`. Below it, the PR's list of what code can't undo: held refunds awaiting a manager, and the window row in the live database.

### After the PR opens

The PR's files and tests, and **Review and approve** for an engineer who didn't request the run. Approving opens the approval dialog below. Once Devin reports the merge, the run shows merged with its commit, and `record_merge` is written for the approver. Rules: `DEVIN_RUN_PROTOCOL.md` § Approval and merge.

### Approval dialog

A modal over the run view. It is where the human gate becomes visible, so it gets the most polish in the console, with the Devin mark and the GitHub mark (Octicons `mark-github`) on the rows each one owns.

```
┌─ Approve PR #14 · clustering_hold ───────────────────────────┐
│  Requested by Refunds manager · "Hold a merchant's not-received…"    │
│                                                              │
│  5 files · +146 −3                         View diff on  ⌥GH │
│  Checks   lint ✓ typecheck ✓ boundaries ✓ tests 76 ✓         │
│  Guards   Stays in plan ✓ Engine untouched ✓ … (8/8)         │
│                                                              │
│                         [ Cancel ]   [ Approve as engineer ] │
├──────────────────────────────────────────────────────────────┤
│  ✓ ⌥GH  Approving review submitted · engineer                │
│  ◌ ◆D   Devin merging · squash into demo-dashboard-devin-…   │
│  ✓ ◆D   Merged · a3f9c21                                     │
│  ✓      Audit row #231 · record_merge                        │
└──────────────────────────────────────────────────────────────┘
```

The lower half fills in after **Approve**, each row with its own spinner and check. The approver can't be the requester, so in the demo the presenter switches to the engineer role first. That switch is part of the point: a different person approves.

### Timing

Live mode shows only what the session reports, as it reports it, with no force-advance. Replay plays a recorded or scripted run on a compressed timer, paced for camera, and says "Replay" wherever it appears.

## Why the request is one sentence

The obvious design for an agent-backed console is a chat panel that takes plain-English commands alongside the buttons. This console keeps the useful part of chat, a natural-language statement of intent, and starts it from the record instead of a conversation.

**Chat is the wrong abstraction for this job.** The operator isn't starting an open-ended conversation with Devin. They are making a specific, governed request about a named piece of operational state: this cluster, this rule, this merged run. The console already has that state on screen, so the request starts from it.

**Chat adds a translation step the console doesn't need.** Chat can be governed. Each step (message, model interpretation, proposed intent, human confirmation, policy check, dispatch) can be written to the audit chain. The cost is that it goes from structured state to prose to machine interpretation and back to structured intent. Starting from the record skips the round trip, and the step where a run gets dispatched against the wrong merchant or a stale threshold.

**The sentence is the demo.** The asymmetry Devin sells is a short human instruction producing substantial engineering work. The viewer understands the before and after without reading code, while Devin has to find where the behaviour lives, change it, test it and open a PR. The intent field is where that sentence goes:

```
Refund rule · Evidence: Kestrel Outdoors cluster · 4 refunds

┌────────────────────────────────────────────────────┐
│ Hold a merchant's not-received refunds once        │
│ together they pass the manager line, and send      │
│ those customers' KYC approvals to a manager.       │
└────────────────────────────────────────────────────┘
Context attached · Scope governed        [ Ask Devin ]
```

Keep it one sentence. Don't grow the field into a specification form. The sentence doesn't mention the window, rejected refunds or frozen-FX amounts; Devin handles each, and that gap is what the viewer should notice.

**Which requests take a sentence.**

- **ADDITION and CHANGE** take free text, because the operator knows the behaviour they want and not how the code does it. For example, on an existing rule: "Also hold refunds when three or more go to the same card within 10 minutes."
- **REMOVAL, REVERSAL and switching a rule off** are buttons. The intent is already fully known, and typing "please remove this rule" adds nothing.

**What this claims.** Business users don't reprogram the fintech through natural language. The claim is that when internally owned software needs engineering work, starting that work takes one sentence from the record, and the engineering stays reviewed. Some sentences will ask for more than a rule. "Require a second reviewer for KYC applications above risk score 90" needs a two-approver primitive the engine doesn't have (`packages/engine/src/approvals.ts` takes one approver per request). **Engine untouched** stops that run at Plan. That's engineering's design work, with Devin as implementer (`CHANGE_TYPES.md`, "Change the engine").

Revisit if operators need to ask for rules with no record to start from, such as "a rule for a market we haven't launched". The answer is still a sentence that produces the same intent, started from `/admin/policy` rather than a cluster.

## `/runs`

A list of every run: kind, intent, requester, status, PR, and the run it reversed, if any. It reads `devin_runs` for state, and `runs/<run_id>/` on the default branch for merged history. **Reverse this change** lives on merged IMPLEMENTATION rows.

## Changes by file

### `tools/automation/` (new tool)

- `schema.ts`: `devin_runs` (`id`, `kind`, `spec`, `intent`, `contextSha256`, `sessionId`, `status`, `prUrl`, `mergeCommit`, `reverses`, `requestedBy`, timestamps, `version`).
- `index.ts`: actions `dispatch`, `record_session`, `approve_pr`, `record_merge`, `stop`, with the rules from `DEVIN_RUN_PROTOCOL.md` § Starting a run is a governed write.
- Add the `engineer` role to `ROLES` and `ROLE_META` (`packages/permissions/src/roles.ts`, `domain: null`) and `DEMO_ACTORS` (`packages/engine/src/actor.ts`), and to the role switcher. `RoleLevel` has no fit: `canApprove` lets every non-agent level decide ops approvals, so `engineer` needs its own level that `canApprove` and `rolesFor` exclude. The build agent does this, not a Devin run.
- `context.ts`: builds `context.json` from the live database. It drops PII, never masks it.
- Register it in `apps/console/src/registry.ts` and `apps/console/src/schema.ts`, and generate a migration.

### `apps/console/src/app/api/devin/` (new)

A server-only route that dispatches, polls and terminates through the v3 API, reading `DEVIN_API_KEY` and `DEVIN_ORG_ID` from the server environment. The browser calls this route, never Devin. Without a key, it serves the replay fixture from `runs/<run_id>/replay.json`.

### Constant registration on start

Call `registerConstants` for every registered tool when the server starts, so constants a merged run declares exist without a re-seed.

## State diagrams to draw before any frontend code

The build agent must first produce ASCII UI state diagrams for this domain and have them reviewed. Generic active/inactive diagrams don't count. At minimum:

1. **Run lifecycle.** `refused` → `dispatched` → `intake` → `baseline` → `plan` → `edit` → `verify` → `pr_open` → `approved` → `merged` (recorded). Side exits: `stopped`, `waiting_for_user`, `failed` (and at which phase), `dispatch_failed`. Mark which transitions are audited intents and which are observed by polling.
2. **The rule's lifecycle across the demo.** `absent` → `requested` → `pr_open` → `live` → `killed` (constant at its off value) → `reversal_requested` → `reversal_pr_open` → `absent`. Show that `killed` and `live` are the same code, and that only the REVERSAL removes it.
3. **Cluster drawer.** `closed` → `open` (no rule covers this) → `run in flight` → `rule live` (rows show held) → `rule killed`, drawn for `refunds_agent` vs `refunds_manager`.
4. **Agent column by mode.** Live, Replay, and history-only (no run in flight). Each state names its data source. A state with no source is cut, or labelled as simulated.
5. **Finished run view.** The completed timeline for an IMPLEMENTATION and for a REVERSAL, with every sub-event from `The run view` filled in from the recorded Kestrel run. This is the still the demo pauses on, so draw it at full size.
6. **Approval dialog.** Idle, approving, Devin merging, merged, and failed (checks re-running, merge conflict), with each row's owner (GitHub or Devin).
