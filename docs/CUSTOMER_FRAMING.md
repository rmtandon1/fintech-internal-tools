# Customer Framing: Devin vs. Power Apps

## 1. The problem

**Who changes an internal tool's rules after launch, how fast, and with what review?**

### How a rule change happens today

A new rule either goes live unreviewed or waits weeks for engineering. The request comes from risk or operations when a queue shows something the current rules don't cover. For example: hold a merchant's refunds once together they pass the manager line, and send those customers' KYC approvals to a manager.

Each Power App holds only its own data, so building the case for the rule is manual:

1. An analyst spots the pattern in one app, such as refunds, exports the queue to Excel and uses a Pivot Table to confirm it
2. They check the same customers in the other systems, such as the KYC app and the payment processor's dashboard, one lookup at a time.
3. They write it up and ask for the rule.

The rule then reaches production one of two ways: a business user edits it directly, or engineering builds it.

```
 One app ──export──▶ Excel pivot ──▶ lookups in the other apps, one at a time
      └─────────── the analyst joins the data by hand ───────────┘
                                 │
                        request for a new rule
                   │                                  │
   A business user edits a Power       Jira ticket to core engineering
   Automate flow in the browser        waits for sprint planning (1–2 weeks)
   live in ~30 min                     engineer traces every rule and setting
   no diff, no reviewer, no test       it touches; writes a test (4–6 h)
                                       PR ─▶ review ─▶ deploy
```



### Why the existing options fail

- **Business edits skip review.** A flow edited in Power Apps goes live with no diff, no second approver and no test. The change history records who saved it, but can't prove the history wasn't edited afterwards. A rule that decides whether money leaves the company needs more control than that.
- **Each app sees only itself.** Rules worth adding often span apps: the refund hold above reads refunds and KYC. Today a person with a spreadsheet joins the two. A rule that reads both needs a shared data model and a test that covers both, and a Power Apps formula has neither.
- **No-code rules miss edge cases the code already handles.** "Sum a merchant's refunds" sounds like a one-line flow. But rejected refunds must not count, goodwill refunds already have their own $50 approval line, and the sum must be in USD at the exchange rate fixed when each refund was requested. The console's code handles all three. A flow edited under pressure drops one without anyone noticing.
- **Feature flags only cover changes someone predicted.** The usual way to let the business change behaviour without engineers is a flag: wrap the logic in `if (flags.isEnabled("refund_clustering_v1"))` and flip it from a dashboard. That needs the rule written in advance, and a rule that comes out of the queue is one nobody predicted. Every flag is also a branch someone has to delete later, and nobody schedules that.



### How the operating model changes

Moving off Power Apps means owning the software. Each row is a question to put to that move, answered for each operating model at the same point.

| | Power Apps (today) | Owned software, engineers only | Owned software, with Devin |
|---|---|---|---|
| **Risk asks for a new rule. How long until it runs in production, and who does the work?** | ~30 minutes. A business user edits the flow in the browser | 1–2 weeks waiting for a sprint, then 4–6 engineer-hours to trace, write and test it | Same day. Devin writes the change in ~30 minutes, and an engineer reviews and merges it |
| **Who checks it before it touches money or customers?** | Nobody. No diff, no second approver, no test | An engineer, 30–60 minutes of review | An engineer, ~5 minutes against the plan Devin committed. CI fails any file outside that plan |
| **It misfires in production. How fast can we stop it, and who has to be there?** | Another live edit, also unreviewed | A hotfix or an urgent ticket, which needs an engineer | An admin switches it off from the policy page in seconds. No engineer |
| **Six months on, who cleans up rules nobody wants?** | Nobody owns it. Old flows and formulas stay in each app | Engineers, when a ticket is prioritised. Dead rules and flags pile up | Devin removes the rule in a reviewed pull request and keeps the work built since |
| **What does the next app cost, and what does it get for free?** | Licences per user, and each app sets up its own roles, approvals and audit | Weeks of engineering, reusing the shared engine | Devin builds the tool, and it inherits approvals, maker-checker and audit from the engine |
| **What can we show an auditor?** | Each app's own change history, which can't prove it wasn't edited | Git history, plus a log per app | One tamper-evident audit log. Every change carries its request, plan, tests and approval |
| **What do we still pay for?** | ~$250K a year, rising with every user and app | All of it: build, review, upkeep and on-call | Engineer review of every change, ownership of the shared engine, hosting and on-call, each integration a Power Apps connector used to provide, and Devin usage |

## 2. Stakeholders



### For Risk and Operations

Turn a pattern you spot in the queue into a live rule the same day. Ask for it in one sentence, from the screen that shows it, and the evidence travels with the request.

**Example:** four `not_received` refunds from Kestrel Outdoors sit just under the $500 manager line, but sum $1,880 together. The refunds manager clicks **Ask Devin for a rule** and in a few hours the next Kestrel refund goes to the manager inbox instead of going through automatically.

**Example:** the same intervention can reach across apps. Even if the original domain was querying a refund, approving the change leads to the case being referred to a kyc manager.

### For Console Admins

Stop a rule the moment it misfires, without waiting on engineering. Then have it taken out of the code cleanly the same day.

**Example:** a courier outage sends a set of genuine refunds to the manager inbox. Every rule Devin adds comes with a setting that switches it off, editable on the admin policy page. The admin turns the rule off there in seconds, with no code change and no engineer, and one audit row records who did it.

**Example:** the admin clicks **Reverse this change**. The codebase has moved on since the rule was added, so a plain `git revert` breaks: Devin has to understand which later behaviour, a `partial_delivery` change to the same file, must survive while it semantically undoes the earlier feature. The PR lists the 60 held refunds for a person to release.

### For Core Engineering

Stop tracing rules by hand. Review a small PR against a one-sentence request and a plan committed before the first edit all while keeping the final say on every merge.

**Example:** the Kestrel hold arrives as five files: the rule, its setting, the KYC check, eight tests and a green `pnpm verify` at 76 tests. Review takes ~5 minutes instead of 4–6 hours, and CI's Boundaries check fails any code that writes to the database without going through the engine.

**Example:** a change to the shared engine, such as requiring a reason on every privileged action, also needs the engine owner's approval. Before approving, the reviewer tries each privileged action in the console and runs `/audit/verify`, so a path Devin missed can't reach production.

### For Compliance and QA

Set a control once and see it hold across every app. Every change arrives with its evidence, its test and its approval, in one log an examiner can verify.

**Example:** internal audit asks for the ticket behind each refund sent to the processor, and there isn't one. Compliance pastes the requirement into a Devin session. After the merge, a refund can't be sent without a reason and a ticket, and filtering `/audit` by one ticket returns every row it authorised across KYC, refunds and flags.

**Example:** `/audit/verify` checks the whole chain live: the Kestrel request, the approval, the merge, the switch-off and the removal, with rows from before the change still verifying.

## 3. Scenarios



### 1. Rules from the queue

- Turn a pattern operators spot in the queue into a reviewed rule the same day.
  - Four refunds from one merchant each sit just under the $500 manager line, and total $1,880 together
  - The refunds manager asks Devin for a hold in one sentence, from the screen that shows the pattern
  - Devin writes the rule, a matching KYC check, a switch-off setting and eight tests, and an engineer approves the pull request
  - The next refund from that merchant waits for a manager
- **Traditional:** An analyst joins two apps in Excel, then waits 1–2 weeks for an engineer to spend 4–6 hours tracing rules and writing the change.



### 2. Instant switch-off

- Stop a misfiring rule in seconds, without waiting on engineering.
  - A courier outage sends genuine refunds to the manager inbox
  - The admin switches the rule off from the policy page
  - Refunds flow again in 30 seconds, and one audit row records who did it
- **Traditional:** Another unreviewed Power Apps edit, or an urgent ticket in the same engineering queue.



### 3. Clean removal

- Take a rule out of the code once it's no longer wanted, and keep everything built since.
  - A plain `git revert` conflicts with a later `partial_delivery` change to the same file
  - Devin removes the rule, its KYC check and its setting, and keeps the later work
  - The pull request lists what code can't undo, such as held refunds for a person to release
  - Removal pull request in ~30 minutes
- **Traditional:** The rule stays in the code behind a switch nobody removes, until an auditor asks why it exists.



### 4. Cross-tool incident response

- Roll back a launch and clean up its damage across apps, from one console.
  - Instant Payouts at 25% of merchants causes duplicate payouts and double-charged fees
  - A manager disables the flag in production, with no approval wait
  - Fee refunds go through maker-checker approval, and a retried request can't pay out twice
  - One audit filter shows the flag change and every refund tied to it
- **Traditional:** Three Power Apps, three audit exports and a spreadsheet to reconstruct one incident.



### 5. One control, every app

- Change a requirement every app shares once, in the shared engine.
  - Compliance asks for a reason and a ticket on every privileged action
  - Devin has to find all five places the console writes audit rows, not only the obvious one
  - The engine owner and an engineer review, and audit rows written before the change still verify
  - One ticket filter returns every row it authorised, across KYC, refunds and flags
- **Traditional:** An edit to every app and every flow, and each new app has to remember the rule.

Every scenario keeps a human gate. In a regulated fintech the gates are the selling point: a rule on money changes as fast as a Power Apps edit and still gets a second reviewer.

## 4. Demo pitch

Speaker notes: 

- **Open on today's two options.** A rule change is either fast and unreviewed, or reviewed and slow.
- **Show the pattern.** On `/t/refunds`, open the Kestrel chip. Say it plainly: each refund is clean, and together they are split around the $500 line. Send `rfnd_0012` to the processor. Nothing stops it. Tell the viewer to remember that click.
- **Make the request.** Click **Ask Devin for a rule** and read the one-sentence request aloud, as the refunds manager would. Note what it leaves out. Point at the evidence panel: this is everything Devin sees, and no customer emails or card numbers are in it.
- **Pause on the finished run.** Point down it: Devin didn't just add a threshold. It wrote `clustering_hold`, placed it after `goodwill_approval` so the trace reads in order, added a window setting with an off value, added `linked_refund_hold` to KYC, built a regression test from the four Kestrel amounts, and ran `pnpm verify`. Each is a row on screen with its file and lines changed, and CI's four checks are green by name: Lint, Typecheck, Boundaries and Test. Boundaries fails any code that writes to the database without going through the engine.
- **One beat on the real pull request.** Open it on GitHub: the five files, the CI checks green, the run id in the description.
- **Approve, then show the proof.** Switch to the engineer role and approve: the GitHub review lands, Devin merges, the audit row writes. Then repeat the earlier click on `rfnd_0013`. It lands in the inbox, and the trace names the rule and the $1,880 total. Open `kyc_0013`: approval now needs a KYC manager. Say it: nothing was switched on, the code changed.
- **Reverse it (recorded, ~30 s).** A courier outage sends Fernhill's genuine refunds to the inbox. Set the window to 0: stopped in 30 seconds. Click **Reverse this change**. Show the conflict line Devin resolved and the 60 held refunds it listed for a person to release. Say it: no flag was added, and none was left behind.
- **Stress-test it (~60 s).** Open `rfnd_0012`'s row on `/audit`: who, when, how much, and no why. Show compliance's requirement as the session prompt. Say why it is the hard case: it changes the engine, and the repo's own `AGENTS.md` points at the wrong place. Show the three-run table: paths covered, where the reason is stored, and whether old rows verify. If a run missed a path, show where the reviewer caught it, then the fix. Point at the second approval: engine changes need the engine owner. Then send a refund: the dialog now asks for a reason and a ticket. Filter `/audit` by that ticket. Say it: this is where Devin needs the most review, and here is how much it needed.
- **Prove the trail.** Run `/audit/verify` live. The request, approval, merge, switch-off, removal and justification rows are all in one tamper-evident chain, and the rows from before the change still verify.
- **End on the build receipt (~10 s).** Show the commit that added `flags`, the third app Devin built: `tools/flags/`, a migration, a line in each registry, and nothing under `packages/engine/`. Its manager and admin approvals, maker-checker and audit are inherited, not written. Then click a stub mode: apps four through twenty are the same job. Say it: Devin changed this engine's rules twice today, and it also built the apps they run in. The commit also changes the home grid under `apps/console/src/app/`, so say "engine untouched", not "only the tool folder".



### The pitch in one paragraph

> Today a rule on money changes one of two ways: fast in Power Apps with nobody reviewing it, or reviewed through a ticket that waits two weeks. In this console a rule is code. When risk spots a pattern, they ask Devin for the rule from the screen that shows it. Devin writes the rule, its setting and a regression test, runs the full suite, and opens a pull request your engineer reviews in minutes. When the rule proves too blunt, one setting switches it off in thirty seconds, and Devin takes it back out of the code the same day. No flag is added and none is left behind. When compliance changes a requirement every app shares, Devin makes that change too, under your engine owner's review, and your reviewer confirms no path was missed before it merges. Every step is a row in a tamper-evident audit log. Power Apps costs $250K a year for apps that each set up their own controls. This is one set of controls, in code you own, that changes as fast as the business asks.

