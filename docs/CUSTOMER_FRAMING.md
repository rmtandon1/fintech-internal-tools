## 1. The problem

**Who changes an internal tool's rules after launch, on what timescale, and with what review?**

### What happens today

A new rule either goes live unreviewed or waits weeks for engineering. 
- The request comes from risk or operations when a queue shows something the current rules don't cover: "hold a merchant's refunds once together they pass the manager line, and send those customers' KYC approvals to a manager"
- Each Power App holds only its own data, so building the case for the rule is manual:
- - An analyst spots an emerging pattern in one app, such as refunds, exports the queue to Excel and uses a Pivot Table to query it
- - They check the same customers with other systems, such as KYC and payments, one lookup at a time.
- - This is documentation with a request for a rule implementation

The rule then reaches production one of two ways: a business user edits it directly, or engineering builds it.

```
 One app ──▶ Excel pivot ──▶ lookups in other apps
      └─── analyst joins the data by hand ─────┘
                          │
                request for a new rule
          │                               │
   BizOps edit a Power          Jira ticket sent to 
   Automate flow in             the dev team; sprint
   the browser and              planning, local tests
   deploy in 30 minutes         review, then deploy  
```


### Why the existing options fail

- **Business edits skip review.** A flow edited in Power Apps goes live with no diff, no second approver and no test. A rule that decides whether money leaves the company should get a second pair of eyes before it runs. The change history records who saved a flow but not why, so when a rule misbehaves the team rebuilds the story from memory and Slack.
- **Each app sees only itself.** Rules worth adding often span apps: the refund hold above reads refunds and KYC. Today a person with a spreadsheet joins the two. A rule that reads both needs a shared data model and a test that covers both, and a Power Apps formula has neither. KYC decisions rest on the same kind of join: whether what the customer declared matches what other sources show, such as the delivery address on a refund or a directorship on Companies House.
- **No-code rules miss edge cases the code already handles.** "Sum a merchant's refunds" sounds like a one-line flow. But rejected refunds must not count, goodwill refunds already have their own $50 approval line, and the sum must be in USD at the exchange rate fixed when each refund was requested. The console's code handles all three. A flow edited under pressure drops one without anyone noticing.
- **Feature flags only cover changes someone predicted.** The usual way to let the business change behaviour without engineers is a flag: wrap the logic in `if (flags.isEnabled("refund_clustering_v1"))` and flip it from a dashboard. That needs the rule written in advance, and a rule that comes out of the queue is one nobody predicted. Every flag is also a branch someone has to delete later, and nobody schedules that.



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

## 2. Stakeholders



### For Risk and Operations

Turn a pattern you spot in the queue into a live rule the same day. Ask for it in one sentence, from the screen that shows it, and the evidence travels with the request.

**Example:** four `not_received` refunds from Kestrel Outdoors sit just under the $500 manager line, but sum $1,880 together. The refunds manager clicks **Ask Devin for a rule** and in a few hours the next Kestrel refund goes to the manager inbox instead of going through automatically.

**Example:** the same intervention can reach across apps. Even if the original domain was querying a refund, approving the change leads to the case being referred to a kyc manager.

### For Console Admins

Stop a rule the moment it misfires, without waiting on engineering. Then have it taken out of the code cleanly the same day.

**Example:** a courier outage sends a set of genuine refunds to the manager inbox. Every rule Devin adds comes with a setting that switches it off, editable on the admin policy page. The admin turns the rule off there in seconds, with no code change and no engineer, and one audit row records who did it.

**Example:** the admin clicks **Undo this change** on the merged run. The codebase has moved on since the rule was added, so a plain `git revert` breaks: Devin has to understand which later behaviour, a `partial_delivery` change to the same file, must survive while it semantically undoes the earlier feature. The PR lists the 60 held refunds for a person to release.

### For Core Engineering

Stop tracing rules by hand. Review a small PR against a one-sentence request and a plan committed before the first edit all while keeping the final say on every merge.

**Example:** the Kestrel hold arrives as one pull request: the rule, its setting, the KYC check, new tests built from the Kestrel amounts, one existing test changed on purpose, and a green `pnpm verify` on top of the 288 tests already there. Review takes ~5 minutes instead of 4–6 hours, and CI's Boundaries check fails any code that writes to the database without going through the engine.

**Example:** the first pull request of the Chargebacks move adds a table, so the engine owner reviews it as well as an engineer. Its description lists every Power App formula and flow step as done or still to do, so nothing from the old app is dropped without someone deciding it.

### For Compliance and QA

Turn a check your analysts do by hand into one that runs from the case, with its source on screen. Every change arrives with its evidence, its test and its approval, in one audit log that says who changed what, and why.

**Example:** analysts look up every UK business on Companies House in another tab and type the result into the case. Devin adds the lookup from the case itself, and a company late with its accounts now needs a manager to approve, with Companies House named as the source.

**Example:** the audit log records the whole run: the Kestrel request, the approval, the merge, the switch-off and the removal, each row naming who did what and when.

## 3. Scenarios

![How work reaches the console](rule-change-workflow.svg)

Editable source: [`rule-change-workflow.excalidraw`](rule-change-workflow.excalidraw).

Three parts of one demo in `LOOM-VIDEO-SCRIPT.md`. The same loop runs each time: the team asks from the screen that shows the need, Devin builds, a different person approves. Each part is a bigger change than the last.

### 1. A rule, from added to removed

- Turn a pattern operators spot in the queue into a reviewed rule the same day.
  - Four refunds from one merchant each sit just under the $500 manager line, and total $1,880 together
  - The refunds manager asks Devin for a hold in one sentence, from the screen that shows the pattern. Devin gets the sentence, the evidence and the files it may touch, and nothing else
  - Devin writes the rule, a matching KYC check, a switch-off setting and tests, and changes the one existing test that said these refunds pass
  - An engineer approves the pull request, and the next refund from that merchant waits for a manager
- Stop it in seconds when it misfires, then remove it from code that has moved on.
  - A courier outage sends a long-standing merchant's genuine refunds to the manager inbox. The refunds ops lead, support and the merchant's account manager all want it off
  - The admin sets the rule's window to 0 on the policy page. Refunds flow again, and one audit row records who did it. Setting it back to 14 turns it on again
  - Risk replaces it with a narrower rule, so the admin asks Devin to undo it. A plain `git revert` conflicts with a later `partial_delivery` change to the same file, so Devin removes the rule, its KYC check and its setting, and keeps the later work
  - The pull request lists what code can't undo: held refunds for a person to release, and the setting left in the database
- **Question it answers:** what happens when requirements change, and what if we want it gone?
- **Traditional:** an analyst joins two apps in Excel, then waits 1–2 weeks for an engineer; the rule then stays in the code behind a switch nobody removes.

### 2. A manual step removed

- Replace a lookup people do by hand with one that runs from the case.
  - Analysts check every UK business on Companies House in another tab, and type the result into the case
  - The request names the outside API and asks Devin to read its documentation on the web. Devin gets the company's public registration, nothing about a person
  - Devin adds the lookup, records responses for its tests, and reuses the rule that already holds a case with a material difference
  - Thornbury Couriers, approved before on a check typed at onboarding, now waits for a manager because its accounts are late
- **Question it answers:** is this only rules, or real engineering against outside systems?
- **Traditional:** a premium Power Automate connector licensed per user, or a ticket that waits for a sprint.
- **Brief:** `COMPANIES_HOUSE_CHECK.md`

### 3. The next app, started

- Start moving a Power App into the console, the way a real migration starts.
  - Chargebacks runs in a Power App with two Power Automate flows: an hourly deadline email, and a first-to-respond approval for large fights
  - The admin asks Devin from the Coming soon page, with the app's export attached
  - Devin's first pull request brings the queue, the 50 disputes, the 48-hour alert as a count and the two riskiest rules, and lists every other formula and flow step as still to do
  - The tile goes live and inherits roles, approvals and the audit log from the engine
- **Question it answers:** can this hold twenty tools, and what does the next one cost?
- **Traditional:** weeks of engineering per app, or keeping the licences.
- **Brief:** `CHARGEBACKS_FROM_POWER_APPS.md`

Every scenario keeps a human gate. In a regulated fintech the gates are the selling point: a rule on money changes as fast as a Power Apps edit and still gets a second reviewer.

## 4. Demo pitch

The beat-by-beat script, with what to say, what to click and the order to record in, is `LOOM-VIDEO-SCRIPT.md`.

### The pitch in one paragraph

> Today a rule on money changes one of two ways: fast in Power Apps with nobody reviewing it, or reviewed through a ticket that waits two weeks. In this console a rule is code, and Devin changes it. When risk spots a pattern, they ask for the rule in one sentence from the screen that shows it. Devin writes the rule and its tests, runs the full suite, and opens a pull request your engineer reviews in minutes. When the rule misfires, one setting switches it off in seconds, and Devin takes it back out of the code the same day, even after the code has moved on. When analysts are doing a lookup by hand, Devin connects the outside source and the case holds itself. When the next Power App needs to move, Devin makes the first pull request and lists the rest. After Power Apps, your team asks, Devin builds, and an engineer approves, whether it's a rule, a manual step or a whole new app.
