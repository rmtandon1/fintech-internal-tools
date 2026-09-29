# Customer Framing

Why this console exists, who it serves and what the demo proves, written for stakeholders rather than engineers. The technical documentation lives in [`docs/`](docs/README.md).

## The Problem

**Fintech teams face a critical challenge: risk and operations need to change the rules that move money quickly and with review, and today they can't have both.** Every change is a false choice. A business user edits Power Apps and the rule runs in 30 minutes with nobody checking it, or an engineer changes the code by hand and the rule waits weeks for a sprint.

### What happens today

A request starts when risk or operations see something in a queue that the current rules don't cover, for example: "route a merchant's refunds to a manager once together they pass the manager line, and send those customers' KYC approvals to a manager". Each Power App holds only its own data, so the case for the rule is built by hand. The reviewed path through engineering then runs in eight steps:

1. **Spot.** An analyst notices an emerging pattern in one app's queue, such as refunds.
2. **Export and join.** They export the queue to Excel, build a Pivot Table, and look up the same customers in other apps, such as KYC and payments, one at a time.
3. **Ticket.** They write up the evidence and file a ticket asking for the rule.
4. **Triage.** A developer triages the ticket and it waits 1–2 weeks for a sprint.
5. **Change.** The developer traces the rule through the code and edits code and config across every dependent file.
6. **Test.** They run the tests locally.
7. **Review.** They open a pull request and wait for another engineer to review it.
8. **Ship.** The pull request merges and deploys.

The fast path skips steps 3–8: a business user edits the Power Automate flow in the browser and it is live in ~30 minutes, with no diff, no second approver and no test.

```
            Analyst spots a pattern in one app's queue
                               │
                               ▼
        Export to Excel ─▶ pivot ─▶ look up other apps by hand
                               │
                     request for a new rule
               ┌───────────────┴───────────────┐
               ▼                               ▼
     FAST PATH: Power Apps           REVIEWED PATH: engineering
     BizOps edit the flow            File a ticket
     in the browser                       │
               │                     Triage, wait for a sprint ····· 1–2 weeks
               │                          │
               │                     Edit code and config ──┐
               │                     across dependent files │
               │                          │                 ├─ 4–6 engineer-hours
               │                     Run tests locally ─────┘
               │                          │
               │                     Open PR, wait for review ······ 30–60 min
               │                          │
               │                     Merge and deploy
               ▼                          ▼
     Live in ~30 min, unreviewed     Live in weeks, reviewed
```

### Why the existing options fail

- **Business edits skip review.** A Power Apps edit goes live with no diff, no second approver, no test and no recorded reason. The save history says who changed a flow, not why, so when a rule that releases money misbehaves the team rebuilds the story from memory and Slack.
- **Each app sees only itself.** Rules worth adding span apps: the refund hold above reads refunds and KYC, and KYC decisions rest on the same kind of join, such as the delivery address on a refund or a directorship on Companies House. A rule that reads both needs a shared data model and a test that covers both. A Power Apps formula has neither, so today the join is a person with a spreadsheet.
- **No-code rules miss edge cases the code already handles.** "Sum a merchant's refunds" sounds like a one-line flow, but rejected refunds must be excluded, goodwill refunds already have their own $50 manager line, and the sum must be in USD at the exchange rate booked when each refund was requested. The console's code handles all three. A flow edited under pressure drops one without anyone noticing.
- **Feature flags only cover changes someone predicted.** A flag such as `if (flags.isEnabled("refund_clustering_v1"))` lets the business flip behaviour from a dashboard, but only if an engineer wrote the rule in advance. A rule that comes out of the queue is one nobody predicted, and every flag leaves a permanent branch that nobody schedules to delete.

### The tax

What each rule change costs today, using the same figures as the tables below:

| | Cost |
|---|---|
| **Time** | 1–2 weeks in the queue, then 4–6 engineer-hours per reviewed change. The ~30-minute alternative is unreviewed, which is worse |
| **Review** | 30–60 engineer-minutes per change |
| **Risk** | Every change either consumes core engineering capacity or ships unreviewed, risking regressions and config drift on rules that move money |
| **Accumulation** | Dead rules and flags pile up with no owner |
| **Licensing** | ~$250K a year for Power Apps, rising with every user and app |

### How the operating model changes

Moving off Power Apps means owning the software. Each row is a question to put to that move, answered for each operating model at the same point.

| | Power Apps (today) | Owned software, engineers only | Owned software, with Devin |
|---|---|---|---|
| **Risk asks for a new rule. How long until it runs in production, and who does the work?** | ~30 minutes. A business user edits the flow in the browser | 1–2 weeks waiting for a sprint, then 4–6 engineer-hours to trace, write and test it | Same day. Devin writes and tests the change, and an engineer reviews and merges it |
| **Who checks it before it touches money or customers?** | Nobody. No diff, no second approver, no test | An engineer, 30–60 minutes of review | An engineer, ~5 minutes against the plan Devin committed. CI fails any file outside that plan |
| **It misfires in production. How fast can we stop it, and who has to be there?** | Another live edit, also unreviewed | A hotfix or an urgent ticket, which needs an engineer | An admin switches it off from the policy page in seconds. No engineer |
| **Six months on, who cleans up rules nobody wants?** | Nobody owns it. Old flows and formulas stay in each app | Engineers, when a ticket is prioritised. Dead rules and flags pile up | Devin removes the rule in a reviewed pull request and keeps the work built since |
| **What does the next app cost, and what does it get for free?** | Licences per user, and each app sets up its own roles, approvals and audit | Weeks of engineering, reusing the shared engine | Devin builds the tool, and it inherits approvals, maker-checker and audit from the engine |
| **Who changed a rule, and why?** | Each app's own save history: who saved it, not why | Git history for the code, plus a separate log per app | One audit log across every app. Every change carries its request, plan, tests and approval |
| **What do we still pay for?** | ~$250K a year, rising with every user and app | All of it: build, review, upkeep and on-call | Engineer review of every change, ownership of the shared engine, hosting and on-call, each integration a Power Apps connector used to provide, and Devin usage |

## Stakeholders

### For Risk and Operations

Turn a pattern you spot in the queue into a live rule the same day. Ask for it in one sentence, from the screen that shows it, and the evidence travels with the request.

**Example:** four `not_received` refunds from Kestrel Outdoors sit just under the $500 manager line, but sum $1,880 together. The Manager clicks **Ask Devin for a rule** and in a few hours the next Kestrel refund leaves the Analyst queue for the Manager queue, where the manager pays or rejects it directly.

**Example:** the same intervention can reach across apps. Even if the original domain was querying a refund, approving the change leads to the case being referred to a Manager.

### For Console Admins

Stop a rule the moment it misfires, without waiting on engineering. Then have it taken out of the code cleanly the same day.

**Example:** a courier outage sends a set of genuine refunds to the manager's queue. Every rule Devin adds comes with a setting that switches it off, editable on the admin policy page. The admin turns the rule off there in seconds, with no code change and no engineer, and one audit row records who did it.

**Example:** the admin clicks **Undo this change** on the merged run. The codebase has moved on since the rule was added, so a plain `git revert` breaks: Devin has to understand which later behaviour, a `partial_delivery` change to the same file, must survive while it semantically undoes the earlier feature. The PR lists the 60 refunds still in the Manager queue for a person to pay or reject.

### For Core Engineering

Stop tracing rules by hand. Review a small PR against a one-sentence request and a plan committed before the first edit all while keeping the final say on every merge.

**Example:** the Kestrel hold arrives as one pull request: the rule, its setting, the KYC check, new tests built from the Kestrel amounts, one existing test changed on purpose, and a green `pnpm verify` on top of the 288 tests already there. Review takes ~5 minutes instead of 4–6 hours, and CI's Boundaries check fails any code that writes to the database without going through the engine.

**Example:** the first pull request of the Chargebacks move adds a table, so the engine owner reviews it as well as an engineer. Its description lists every Power App formula and flow step as done or still to do, so nothing from the old app is dropped without someone deciding it.

### For Compliance and QA

Turn a check your analysts do by hand into one that runs from the case, with its source on screen. Every change arrives with its evidence, its test and its approval, in one audit log that says who changed what, and why.

**Example:** analysts look up every UK business on Companies House in another tab and type the result into the case. Devin adds the lookup from the case itself, and a company late with its accounts now needs a manager to approve, with Companies House named as the source.

**Example:** the audit log records the whole run: the Kestrel request, the approval, the merge, the switch-off and the removal, each row naming who did what and when.

## Scenarios

![How work reaches the console](docs/rule-change-workflow.svg)

Editable source: [`docs/rule-change-workflow.excalidraw`](docs/rule-change-workflow.excalidraw).

Three parts of one demo in [`docs/LOOM-VIDEO-SCRIPT.md`](docs/LOOM-VIDEO-SCRIPT.md). The same loop runs each time: the team asks from the screen that shows the need, Devin builds, a different person approves. Each part is a bigger change than the last.

### 1. A rule, from added to removed

**Scenario.** Four `not_received` refunds from one merchant each sit just under the $500 manager line, and total $1,880 together. Later, a courier outage sends a long-standing merchant's genuine refunds to the manager's queue, and the refunds ops lead, support and the merchant's account manager all want the rule off. Question it answers: what happens when requirements change, and what if we want it gone?

**Traditional cost.** An analyst joins two apps in Excel, then waits 1–2 weeks for an engineer and 4–6 engineer-hours of work. The rule then stays in the code behind a switch nobody removes.

**Automated path.**

- The Manager asks Devin for a hold in one sentence, from the screen that shows the pattern. Devin gets the sentence, the evidence and the files it may touch, and nothing else
- Devin writes the rule, a matching KYC check, a switch-off setting and tests, and changes the one existing test that said these refunds pass
- An engineer approves the pull request, and the next refund from that merchant leaves the Analyst queue for the Manager queue, where the Manager pays or rejects it directly
- When it misfires, the admin sets the rule's window to 0 on the policy page. Refunds flow again, and one audit row records who did it. Setting it back to 14 turns it on again
- Risk replaces it with a narrower rule, so the admin asks Devin to undo it. A plain `git revert` conflicts with a later `partial_delivery` change to the same file, so Devin removes the rule, its KYC check and its setting, and keeps the later work
- The pull request lists what code can't undo: routed refunds for a person to pay or reject, and the setting left in the database

**Business value.** A pattern spotted in the queue becomes a reviewed rule the same day, can be stopped in seconds without an engineer, and leaves no dead code behind when it goes.

### 2. A manual step removed

**Scenario.** Analysts check every UK business on Companies House in another tab, and type the result into the case. Question it answers: is this only rules, or real engineering against outside systems?

**Traditional cost.** A premium Power Automate connector licensed per user, or a ticket that waits for a sprint.

**Automated path.**

- The request names the outside API and asks Devin to read its documentation on the web. Devin gets the company's public registration, nothing about a person
- Devin adds the lookup, records responses for its tests, and reuses the rule that already holds a case with a material difference
- Thornbury Couriers, approved before on a check typed at onboarding, now waits for a manager because its accounts are late

**Business value.** A lookup people repeat on every case runs from the case itself, with its source on screen, and a late or dissolved company can't be approved on a note typed at onboarding.

Brief: [`docs/COMPANIES_HOUSE_CHECK.md`](docs/COMPANIES_HOUSE_CHECK.md)

### 3. The next app, started

**Scenario.** Chargebacks runs in a Power App with two Power Automate flows: an hourly deadline email, and a first-to-respond approval for large fights. Question it answers: can this hold twenty tools, and what does the next one cost?

**Traditional cost.** Weeks of engineering per app, or keeping the licences.

**Automated path.**

- The admin asks Devin from the Coming soon page, with the app's export attached
- Devin's first pull request brings the queue, the 50 disputes, the 48-hour alert as a count and the two riskiest rules, and lists every other formula and flow step as still to do
- The tile goes live and inherits roles, approvals and the audit log from the engine

**Business value.** The move off Power Apps starts with one reviewed pull request, and the rest of the migration arrives as a list of small requests instead of a project plan.

Brief: [`docs/CHARGEBACKS_FROM_POWER_APPS.md`](docs/CHARGEBACKS_FROM_POWER_APPS.md)

### Metrics comparison

| Measure | Power Apps (today) | Owned software, engineers only | Owned software, with Devin |
|---|---|---|---|
| Time from request to a live rule | ~30 minutes, unreviewed | 1–2 weeks, then 4–6 engineer-hours | Same day |
| Review before it touches money | None | 30–60 minutes of engineer review | ~5 minutes against a committed plan, CI fails files outside it |
| Switching a misfiring rule off | Another unreviewed live edit | A hotfix that needs an engineer | Seconds, on the admin policy page, no engineer |
| Removing a rule nobody wants | Nobody owns it | When a ticket is prioritised | One reviewed pull request that keeps later work |
| Cost of the next app | Licences per user | Weeks of engineering | A first pull request, plus a list of the rest |

Every scenario keeps a human gate. In a regulated fintech the gates are the selling point: a rule on money changes as fast as a Power Apps edit and still gets a second reviewer.

## Demo pitch

The beat-by-beat script, with what to say, what to click and the order to record in, is [`docs/LOOM-VIDEO-SCRIPT.md`](docs/LOOM-VIDEO-SCRIPT.md).

### The pitch in one paragraph

> Today a rule on money changes one of two ways: fast in Power Apps with nobody reviewing it, or reviewed through a ticket that waits two weeks. In this console a rule is code, and Devin changes it. When risk spots a pattern, they ask for the rule in one sentence from the screen that shows it. Devin writes the rule and its tests, runs the full suite, and opens a pull request your engineer reviews in minutes. When the rule misfires, one setting switches it off in seconds, and Devin takes it back out of the code the same day, even after the code has moved on. When analysts are doing a lookup by hand, Devin connects the outside source and the case holds itself. When the next Power App needs to move, Devin makes the first pull request and lists the rest. After Power Apps, your team asks, Devin builds, and an engineer approves, whether it's a rule, a manual step or a whole new app.

### Engineering challenge: GitHub approval drift

Engineers approved and merged Devin's pull requests on GitHub, and the console's governed record didn't follow: a GitHub-approved run still read Devin working, and a GitHub-side merge never reached the audit log. The console only listened to its own **Review and approve** button. It was traced from GitHub back to the run record and fixed in four layers, each through the same governed write path: read the reviews at the PR's head on every poll, map the reviewer's GitHub login to a console engineer, run that approval as the same `approve_pr` intent with the same rules and idempotency key (so the requester still can't approve), and record a merge with no approval under `merge_without_recorded_approval` with the gap named on the run. The Loom tells it in 30 seconds; the write-up is [`docs/GITHUB_APPROVAL_DRIFT.md`](docs/GITHUB_APPROVAL_DRIFT.md). A second layered fix, post-merge deployment drift (merged code reaching the running console), is in [`docs/POST_MERGE_DEPLOYMENT_DRIFT.md`](docs/POST_MERGE_DEPLOYMENT_DRIFT.md).

## Capabilities in depth

The same five operations as the README's Usage section, taken one level down: who has the problem, what they do today, and exactly what the automation does, file by file.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               OPERATIONS CONSOLE  (localhost:3001)                       │
│         Home · Refunds · KYC review · Feature flags · Inbox · Audit · Policy · Runs      │
└───────────────┬───────────────────────────────┬───────────────────────────────┬──────────┘
                │                               │                               │
        ┌───────▼───────┐               ┌───────▼───────┐               ┌───────▼───────┐
        │     RULES     │               │    CHECKS     │               │     APPS      │
        └───┬───┬───┬───┘               └───────┬───────┘               └───────┬───────┘
            │   │   │                           │                               │
   ┌────────┘   │   └────────┐                  │                               │
   ▼            ▼            ▼                  ▼                               ▼
┌────────┐ ┌──────────┐ ┌─────────┐      ┌─────────────┐                ┌──────────────┐
│  ADD   │ │SWITCH OFF│ │ REMOVE  │      │  AUTOMATE   │                │    START     │
│ Devin  │ │ setting  │ │ Devin   │      │  Devin      │                │ Devin + flag │
└───┬────┘ └────┬─────┘ └────┬────┘      └──────┬──────┘                └──────┬───────┘
    │           │            │                  │                              │
    ▼           ▼            ▼                  ▼                              ▼
 tools/      settings     git revert       tools/kyc/                    tools/chargebacks/
 refunds/    row in       of the merge,    companies-house.ts            registry.ts
 kyc/        SQLite       later work kept  + recorded responses          migration 0009
 + tests     (no code)    + tests named    + tests                       flag row + tests
```

Line counts for the check and the app are the file sizes at merge (#61, #62). Counts for the rule are from its reference run.

### Add a rule

**Scenario.** Risk analysts find merchants splitting "not received" refunds just under the $500 manager line costly, because each one passes on its own.

- **Traditional.** An analyst exports the refunds queue to Excel, pivots it by merchant, looks each customer up in KYC by hand, and files a ticket. It waits 1–2 weeks for a sprint, then 4–6 engineer-hours to trace and test.
- **Automated.** The Manager clicks **Ask Devin for a rule** on the Kestrel Outdoors cluster and sends one sentence. An engineer reviews for ~5 minutes the same day.

What the automation does:

1. `dispatch` checks the role and that no refunds run is in flight; writes the run row and one audit row.
2. Writes `runs/<run_id>/context.json`: the sentence, four refunds with no personal data, `refunds.manager_approval_usd_minor` = 50000, `kyc.manager_review_score` = 70, base commit, allowed files.
3. Opens a Devin session with the playbook and the file attached.
4. Devin runs `pnpm verify` at the base and records per-file test counts.
5. Commits `plan.json` with five planned files before any edit.
6. Creates `tools/refunds/src/clustering-hold.ts` (+84): sums a merchant's `not_received` refunds in USD at the booked rate, skips rejected ones, reads a 14-day window where 0 means off.
7. Adds `clustering_hold` to the refund action in `tools/refunds/src/index.ts`.
8. Adds `linked_refund_hold` to KYC approval in `tools/kyc/src/index.ts` (+12 −1).
9. Writes the eight hold tests and changes the one assertion in `refunds-clusters.test.ts` that said all four refunds pass.
10. Runs Lint, Typecheck, Boundaries, Run guard and Test; opens the PR (5 files, +146 −3).

### Switch a rule off

**Scenario.** Refunds ops find a courier outage sending sixty genuine Fernhill Home refunds to the manager's queue disruptive, and support fields the customers whose money is stuck.

- **Traditional.** A hotfix ticket, or another unreviewed live edit to a flow.
- **Automated.** An admin sets `refunds.clustering_window_days` to 0 on `/admin/policy`. Seconds, no engineer.

What the automation does:

1. `updateConstant` submits the change through the engine like any other write.
2. The engine checks the admin role and writes the new value and one audit row with old and new values.
3. The next refund decision reads 0. `clustering_hold` still runs and answers **allow**.
4. Setting it back to 14 turns the rule on again. No file changes at any point.

### Remove a rule

**Scenario.** Risk finds the clustering hold too broad and wants a narrower card-based rule instead. The old rule should leave the code, not sit behind a switch.

- **Traditional.** An engineer reverts by hand. A later `partial_delivery` change to the same file makes `git revert` conflict, so the job waits for someone who knows both changes.
- **Automated.** The admin clicks **Undo this change** on the merged run, then **Ask Devin to undo it**.

What the automation does:

1. `dispatch` with `operation: undo`, naming the run and merge commit it reverses.
2. `context.json` carries the settings at the original dispatch and now, so Devin can tell which an admin changed.
3. Devin commits `plan.json` naming the eight tests it will delete.
4. Runs `git revert -m 1 <merge>` on a fresh branch.
5. Resolves the conflict in `tools/refunds/src/index.ts`: keeps `partial_delivery`, removes `clustering_hold`.
6. Deletes `clustering-hold.ts`, removes `linked_refund_hold` from `tools/kyc/src/index.ts`.
7. Checks every other file is back to its pre-merge content, except later merged work.
8. Opens the PR with the conflict record and what code can't undo: refunds still in the Manager queue for direct action and the setting row.

### Automate a check

**Scenario.** KYC analysts find checking every UK business on Companies House by hand slow and error-prone. They open another tab, read the filings and type a note.

- **Traditional.** A premium Power Automate connector licensed per user, or a ticket that waits for a sprint.
- **Automated.** A Manager or admin clicks **Ask Devin to add a check** on Thornbury Couriers (`kyc_0104`).

What the automation does:

1. `context.json` carries the company name, registration number `09318842` and country. Nothing about a person.
2. Devin reads the Companies House API docs on the web; none are pasted in.
3. Plans five files and four reused modules, including `declared_vs_found`.
4. Creates `tools/kyc/src/companies-house.ts` (249 lines): live lookup by Basic auth when `COMPANIES_HOUSE_API_KEY` is set; dissolved, liquidation and overdue accounts become material rows; errors become "couldn't check".
5. Creates `tools/kyc/src/companies-house-recorded.ts` (75 lines): recorded responses, `09318842` late with its accounts.
6. Adds a `check_companies_house` action to `tools/kyc/src/index.ts`, through `executeIntent`, UK business cases only.
7. Documents the key in `.env.example`.
8. Writes `apps/console/tests/tools/kyc-companies-house.test.ts` (362 lines, 14 behaviours, no live call).
9. Adds no new rule: the existing `declared_vs_found` holds approval for a Manager.

### Start an app

**Scenario.** The disputes team finds Chargebacks in Power Apps costly per user, and its two flows (an hourly deadline email and a first-to-respond approval) invisible to the rest of the console.

- **Traditional.** Weeks of engineering per app, or keeping the licences.
- **Automated.** An admin clicks **Ask Devin to start this app** on `/roadmap/chargebacks`. The first pull request brings the queue and the two riskiest rules; the rest becomes a list.

What the automation does:

1. `context.json` lists the seven export files in `fixtures/power-apps/chargebacks/`. This spec is sent, so Devin also reads its "sent to Devin" section.
2. Plans about fifteen files; the engine owner reviews too, because the change adds a table.
3. Creates `tools/chargebacks/package.json` (20) and `tsconfig.json` (7).
4. Creates `tools/chargebacks/src/schema.ts` (28): `chargeback_disputes` with the export's columns.
5. Creates `tools/chargebacks/src/seed.ts` (105): the 50 disputes, dates kept as offsets from the export time.
6. Creates `tools/chargebacks/src/index.ts` (325): queue, the 48-hour count, fraud accepts over $500 and fights over $2,500 to a manager.
7. Adds one line to `apps/console/src/registry.ts` and one re-export to `apps/console/src/schema.ts`.
8. Generates migration `0009` and its journal entry; updates `pnpm-lock.yaml` (+21).
9. Seeds `app.chargebacks` off in `tools/flags/src/seed.ts` and sets the mode's `flag` in `modes.ts`.
10. Writes `apps/console/tests/tools/chargebacks.test.ts` (212 lines); nothing under `packages/`.
11. The PR lists every formula and flow step as done or still to do. After merge, an admin turns on `app.chargebacks`.
