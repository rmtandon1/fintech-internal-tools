# Agent Trigger Surface

## Summary

- A Devin run starts from the screen that shows why it is needed: the cluster drawer, a rule's row, or a merged change. The request carries that screen's evidence with it.
- The handoff panel holds one editable sentence, plus the evidence, allowed paths and mode the system fills in. The requester sees exactly what Devin will see.
- The run view shows the artifacts an engineer would check: planned files, lines changed, test counts and the four CI checks by name. The finished run is the still the demo pauses on.
- The approval dialog is where the human gate shows: an engineer who didn't request the run approves, then Devin merges.
- Run mechanics live in `DEVIN_RUN_PROTOCOL.md`. This file covers the UI around them.

## Where each run starts

A run starts from the screen that shows why it is needed, so the request carries its evidence with it.

| Request | Starts from | Button | Role |
|---|---|---|---|
| New rule | Cluster drawer on `/t/refunds` | **Ask Devin for a rule** | Refunds manager, admin |
| New check (`COMPANIES_HOUSE_CHECK.md`) | A UK business case, `/t/kyc/<id>` | **Ask Devin to add a check** | KYC manager, admin. A KYC reviewer sees no button |
| New app (`CHARGEBACKS_FROM_POWER_APPS.md`) | Its Coming soon page, `/roadmap/chargebacks`, once its export is committed | **Ask Devin to start this app** | Admin. Managers see it greyed out with who can ask |
| Rule change or rule removal | A rule's row in the policy trace, or `/admin/policy` | **Ask Devin to change this rule** / **to remove this rule** | Manager of the rule's domain, admin (removal: admin) |
| Undo a change | A merged change in `/runs` | **Undo this change** | Admin |
| Switch a rule off | `/admin/policy`, on the rule's off setting | The existing constant editor | Admin |

Switching a rule off uses the existing constant editor. The rule's spec names which constant, at which value, turns it off. An app is switched the same way, with a feature flag instead of a setting: a built app whose flag is off reads Switched off on the home tile and its roadmap page, and turns on from `/t/flags`.

**Button labels.** Each button starts with "Ask Devin", because the operator sends one sentence and the result comes later, after review.

## The handoff panel

It opens in the Devin window (`apps/console/src/components/agent-window.tsx`; controls in `CONSOLE_ROLE_VIEWS.md`) and holds:

- **Intent**: one sentence, prefilled from the spec and editable. This is the only free text in the flow.
- **Evidence**: what goes into the run's context: cluster rows with PII dropped, the live constants the rule depends on, and the base commit. It is shown so the requester sees exactly what Devin will see.
- **Scope**: the files the spec allows, read-only.
- **Start run**: submits the dispatch intent. A policy denial shows in the standard `PolicyTrace`, for example "a run is already in flight on refunds".

Once the run starts, the same column becomes the run view.

**Grouped layout.** The fields sit in four groups: REQUEST (the intent, the one editable field) and three blocks the system fills in: CONTEXT (evidence, constants, base commit, no PII), GUARDRAILS (the allowed files) and EXECUTION (start). It shows without narration that the operator writes one sentence and the system supplies the rest. Two requirements:

1. The group headers don't push the evidence line below the fold (see On camera).
2. The GUARDRAILS caption reads "The PR's checks: Lint · Typecheck · Boundaries · Test. Approval: an engineer who did not request the run", not "outside the allowed paths". The four CI checks gate the merge; the allowed paths are the outer bound the plan must fall within.

## On camera

This panel carries three lines of the demo pitch (`../CUSTOMER_FRAMING.md` › Demo pitch), so it has to make both visible without narration:

- **"This is everything Devin sees."** The evidence block shows the four Kestrel amounts, the $500 and score-70 lines and base commit `1a67f60`, and no email or card number. If the presenter has to scroll to prove the PII is absent, the panel is too long.
- **"The commitment comes before the first edit."** When the Plan phase lands, the run view lists the five planned paths, not just a count, so the viewer sees the commitment before the first edit — and the reviewer checks the diff against it.
- **"Devin didn't just add a threshold."** The finished run view shows every file with its +/− lines, `pnpm verify` split into its four checks — Lint, Typecheck, Boundaries and Test — each passing. The presenter points at it instead of listing files from memory.

## The run view

The run view is the demo's evidence that Devin did real engineering work. It shows the artifacts a reviewing engineer would check, not a spinner. The frame to design for is the **finished run**: the presenter pauses on it, and it has to carry the "name every file Devin touched" line with no narration.

### Operator summary (top)

- The intent sentence, the requester and the operation, in human terms: Change or Undo a change.
- Status: running phase, waiting for a reply, PR open, merged, or stopped.
- What changes once merged, in business terms: "Refunds that take a merchant's not-received total past the manager line go to the manager inbox."
- **Stop run**, **Open in Devin**, and the **Reply box** while the session is waiting for a reply. The reply goes to the session's messages endpoint and is recorded on the run.

### Run checklist (between the two)

A glyph checklist that summarises the run in one glance: `✓` done, `●` running, `○` waiting. Every line reads from the session's structured progress (`DEVIN_RUN_PROTOCOL.md` § Progress). A line advances only when the session reports it, never on a timer. Lines are named artifacts, not generic activity:

```
✓ Inspecting architecture         intake · base 1a67f60
✓ Baseline green                  68 tests
✓ Reusing engine intent pipeline  packages/engine/src/execute-intent.ts
✓ Reusing manager approval tier   packages/engine/src/approvals.ts
● Editing refunds/clustering-hold.ts  +84
○ Verify                          Lint · Typecheck · Boundaries · Test
○ Tests                           68 → 76
○ Opening pull request
```

- **Reusing lines** come from the run's plan file, so they appear when the Plan phase lands. They show the change sitting on the existing engine rather than beside it.
- **Editing** shows the file currently being written, from the newest entry in the session's file list.
- **Running guards** and **Tests** expand to the guard names and verify steps the timeline below already shows. The checklist is the summary, the timeline stays the evidence.
- An undo swaps the reuse lines for `✓ Reverting <merge>` and `✓ Resolving conflict in <file>`.

The checklist is a second reading of the same fields as the timeline, not a second data source. If a line has no field behind it, cut the line.

### Engineering detail (below; open by default in the demo, collapsible in the product)

One timeline, one row per phase, each with a state (waiting, running with spinner, done with check, stopped) and a duration. Sub-events appear under each phase as the session reports them:

- **Intake:** spec path, base branch and commit `1a67f60`, context SHA-256 (first 8 characters, matching the dispatch audit row).
- **Baseline:** `pnpm verify` green at base, 68 tests.
- **Plan:** branch `devin/<run_id>-clustering-hold`, plan commit SHA, and the planned paths with `create` or `modify` and a one-line reason each.
- **Edit:** per file, +/− lines and the symbol touched, e.g. `tools/kyc/src/index.ts · modify · +12 −1 · linked_refund_hold on approve`.
- **Verify:** `pnpm verify` split into lint, typecheck, boundaries and tests (68 → 76), then each guard check by name with its result: **Stays in plan**, **Plan stays in scope**, **Run dir frozen**, **Shared code reported**. **Context untouched** is checked at approval, not CI, so it shows in the approval dialog (`DEVIN_RUN_PROTOCOL.md` § Guard checks).
- **Pull request:** PR number and title, link to GitHub.

For an undo, two more things show:

- **What it reverses**, at the top: the original run id, its intent, its merge commit and PR, each linked. This is where the operator sees what "undo" refers to. Git and `runs/<run_id>/` hold the previous state, so there is no separate backup to show.
- **The conflict**, as its own Edit sub-event: `git revert -m 1 <merge>` → conflict in `tools/refunds/src/index.ts` → kept `partial_delivery` (PR #n), removed `clustering_hold`. Below it, the PR's list of what code can't undo: held refunds awaiting a manager, and the window row in the live database.

### After the PR opens

The PR's files and tests, and **Review and approve** for an engineer who didn't request the run. Approving opens the approval dialog below. Once Devin reports the merge, the run shows merged with its commit, and the merge is written for the approver. Rules: `DEVIN_RUN_PROTOCOL.md` § Approval and merge.

### Approval dialog

A modal over the run view. It is where the human gate becomes visible, so it gets the most polish in the console, with the Devin mark and the GitHub mark (Octicons `mark-github`) on the rows each one owns.

```
┌─ Approve PR #14 · clustering_hold ───────────────────────────┐
│  Requested by Refunds manager · "Hold a merchant's not-received…"    │
│                                                              │
│  5 files · +146 −3                         View diff on  ⌥GH │
│  Checks   lint ✓ typecheck ✓ boundaries ✓ tests 76 ✓         │
│  Context  untouched ✓  · checked at approval               │
│                                                              │
│                         [ Cancel ]   [ Approve as engineer ] │
├──────────────────────────────────────────────────────────────┤
│  ✓ ⌥GH  Approving review submitted · engineer                │
│  ◌ ◆D   Devin merging · squash into demo-dashboard-devin-…   │
│  ✓ ◆D   Merged · a3f9c21                                     │
│  ✓      Pulled into local checkout · 0883eda → a3f9c21       │
│  ✓      Audit row #231 · merge recorded                       │
└──────────────────────────────────────────────────────────────┘
```

The lower half fills in after **Approve**, each row with its own spinner and check. The approver can't be the requester, so in the demo the presenter switches to the engineer role first. That switch is part of the point: a different person approves.

### Timing

The view shows only what the session reports, as it reports it, with no force-advance.

## Why the request is one sentence

The obvious design for an agent-backed console is a chat panel that takes plain-English commands alongside the buttons. This console keeps the useful part of chat, a natural-language statement of intent, and starts it from the record instead of a conversation.

**Chat is the wrong abstraction for this job.** The operator isn't starting an open-ended conversation with Devin. They are making a specific, governed request about a named piece of operational state: this cluster, this rule, this merged change. The console already has that state on screen, so the request starts from it.

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

- **New rules and rule changes** take free text, because the operator knows the behaviour they want and not how the code does it. For example, on an existing rule: "Also hold refunds when three or more go to the same card within 10 minutes."
- **Rule removal, undoing a change and switching a rule off** are buttons. The intent is already fully known, and typing "please remove this rule" adds nothing.

**What this claims.** Business users don't reprogram the fintech through natural language. The claim is that when internally owned software needs engineering work, starting that work takes one sentence from the record, and the engineering stays reviewed. Some sentences will ask for more than a rule. "Require a second reviewer for KYC applications above risk score 90" needs a two-approver primitive the engine doesn't have (`packages/engine/src/approvals.ts` takes one approver per request). The plan's allowed paths stop that run at Plan. That's engineering's design work, with Devin as implementer (`DEVIN-NO-DEVIN.md`, "Change the engine").

Revisit if operators need to ask for rules with no record to start from, such as "a rule for a market we haven't launched". The answer is still a sentence that produces the same intent, started from `/admin/policy` rather than a cluster.

## `/runs`

A list of every run: operation, intent, requester, status, PR, and the change it undid, if any. It reads the run table for state, and `runs/<run_id>/` on the default branch for merged history. **Undo this change** lives on merged rule changes. For the `engineer` role, **Reconcile** re-reads every approved run's PR on GitHub, records the ones that landed, then pulls the newest merge into the local checkout (`GITHUB_INTEGRATION.md` § Merge sync).

## Changes by file

### `tools/automation/` (new tool)

- `schema.ts`: the runs table (`id`, operation, spec, intent, context hash, session id, status, PR, merge commit, the run it undoes, requester, timestamps, `version`).
- `index.ts`: actions dispatch, record session, approve PR, record merge and stop, with the rules from `DEVIN_RUN_PROTOCOL.md` § Starting a run is a governed write.
- Add the `engineer` role to `ROLES` and `ROLE_META` (`packages/permissions/src/roles.ts`, `domain: null`) and `DEMO_ACTORS` (`packages/engine/src/actor.ts`), and to the role switcher. `RoleLevel` has no fit: `canApprove` lets every non-agent level decide ops approvals, so `engineer` needs its own level that `canApprove` and `rolesFor` exclude. The build agent does this, not a Devin run.
- The `engineer` reviews code and approves PRs, and never decides ops approvals: `canApprove("engineer")` is `false`, `rolesFor` never returns it for any domain or level, and `MANAGER_ROLES` excludes it. It can see the inbox and the audit chain, but no **Approve** or **Reject** on a pending request renders for it.
- `context.ts`: builds the run context from the live database. It drops PII, never masks it.
- Register it in `apps/console/src/registry.ts` and `apps/console/src/schema.ts`, and generate a migration.

### `apps/console/src/app/api/devin/` (new)

A server-only route that dispatches, polls and terminates through the v3 API, reading `DEVIN_API_KEY` from the server environment; the organisation comes from `GET /v3/self` unless `DEVIN_ORG_ID` overrides it. The browser calls this route, never Devin. Without a key Devin is not connected (`GET /api/devin/status` reports it): the Devin window and the "Ask Devin for a rule" button say `Devin not connected`, dispatch is refused before it reaches the bridge, and no run or audit row is written.

In live mode, every poll response (status, status detail, structured output, with a timestamp) is appended to `apps/console/data/replays/<run_id>.json`, shaped exactly like a committed replay; reads try that file first, then `runs/<run_id>/replay.json` for committed recorded runs. `apps/console/data/` is gitignored, so this is a local recording, not state: it is never read back into the run table (`DEVIN_RUN_PROTOCOL.md` § Starting a run is a governed write). Once a real run has finished, the file can be committed by hand as `runs/<run_id>/replay.json`, so the replay the demo plays is a recorded run rather than a scripted one.

### Constant registration on start

Call `registerConstants` for every registered tool when the server starts, so constants a merged run declares exist without a re-seed.

## State diagrams to draw before any frontend code

The build agent must first produce ASCII UI state diagrams for this domain and have them reviewed. Generic active/inactive diagrams don't count. At minimum:

1. **Run lifecycle.** `refused` → `dispatched` → `intake` → `baseline` → `plan` → `edit` → `verify` → `pr_open` → `approved` → `merged`. Side exits: `stopped`, waiting for a reply, `failed` (and at which phase), `dispatch_failed`. Mark which transitions are audited intents and which are observed by polling.
2. **The rule's lifecycle across the demo.** `absent` → `requested` → `pr_open` → `live` → `off` (constant at its off value) → `undo requested` → `undo pr open` → `absent`. Show that `off` and `live` are the same code, and that only an undo removes it.
3. **Cluster drawer.** `closed` → `open` (no rule covers this) → `run in flight` → `rule live` (rows show held) → `rule off`, drawn for `refunds_agent` vs `refunds_manager`.
4. **Agent column.** Run in flight and history-only (no run in flight). Each state names its data source. A state with no source is cut, or labelled as simulated.
5. **Finished run view.** The completed timeline for a new rule and for an undo, with every sub-event from `The run view` filled in from a completed Kestrel run. This is the still the demo pauses on, so draw it at full size.
6. **Approval dialog.** Idle, approving, Devin merging, merged, and failed (checks re-running, merge conflict), with each row's owner (GitHub or Devin).
