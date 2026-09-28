## 1. The problem

**Once internal tools leave Power Apps, who does the engineering on them, how fast, and with what review?**

Owning the tools means three kinds of work, forever: new checks and rules from the people who use them, changes to how every app works, and moving each remaining Power App across. This document and the Loom take one of each.

### What happens today

A new rule either goes live unreviewed or waits weeks for engineering. 
- The request comes from risk, compliance or operations when the tools don't cover something: "check every UK business on Companies House", "two people must approve large refunds", "move the chargebacks app over"
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
- **Each app sees only itself.** Checks worth adding often need data the app doesn't hold: a KYC decision that depends on a company's filings at Companies House, or a refund's link to a customer in KYC. Today a person in another browser tab does the join. Doing it in code needs a shared data model, a key kept on a server and a test that covers the outside source, and a Power Apps formula has none of them. KYC decisions rest on the same kind of join: whether what the customer declared matches what other sources show, such as the delivery address on a refund or a directorship on Companies House.
- **No-code rules miss edge cases that matter.** "Two people approve large refunds" sounds like one setting on an approval step. But the person who asked must not be one of them, nobody may approve twice, requests already waiting keep the rule they were made under, and each approval needs its own audit row. Power Automate's approvals offer "first to respond" or "everyone must approve", and neither is "any two, but not the requester".
- **Feature flags only cover changes someone predicted.** The usual way to let the business change behaviour without engineers is a flag: wrap the logic in `if (flags.isEnabled("companies_house_check"))` and flip it from a dashboard. That needs the rule written in advance, and a rule that comes out of the queue is one nobody predicted. Every flag is also a branch someone has to delete later, and nobody schedules that.



### How the operating model changes

Moving off Power Apps means owning the software. Each row is a question to put to that move, answered for each operating model at the same point.

| | Power Apps (today) | Owned software, engineers only | Owned software, with Devin |
|---|---|---|---|
| **Risk asks for a new rule. How long until it runs in production, and who does the work?** | ~30 minutes. A business user edits the flow in the browser | 1–2 weeks waiting for a sprint, then 4–6 engineer-hours to trace, write and test it | Same day. Devin writes and tests the change, and an engineer reviews and merges it |
| **Who checks it before it touches money or customers?** | Nobody. No diff, no second approver, no test | An engineer, 30–60 minutes of review | An engineer, ~5 minutes against the plan Devin committed. CI fails any file outside that plan |
| **It misfires in production. How fast can we stop it, and who has to be there?** | Another live edit, also unreviewed | A hotfix or an urgent ticket, which needs an engineer | An admin switches it off from the policy page in seconds. No engineer |
| **Six months on, who cleans up rules nobody wants?** | Nobody owns it. Old flows and formulas stay in each app | Engineers, when a ticket is prioritised. Dead rules and flags pile up | Devin removes the rule in a reviewed pull request and keeps the work built since |
| **What does the next app cost, and what does it get for free?** | Licences per user, and each app sets up its own roles, approvals and audit | Weeks of engineering, reusing the shared engine | Devin rebuilds it from its Power Apps export, and it inherits roles, approvals, maker-checker and audit from the engine |
| **Who changed a rule, and why?** | Each app's own save history: who saved it, not why | Git history for the code, plus a separate log per app | One audit log across every app. Every change carries its request, plan, tests and approval |
| **What do we still pay for?** | ~$250K a year, rising with every user and app | All of it: build, review, upkeep and on-call | Engineer review of every change, ownership of the shared engine, hosting and on-call, each integration a Power Apps connector used to provide, and Devin usage |

## 2. Stakeholders

### For Engineering Leadership

Own twenty internal tools without a platform team. Your engineers decide what gets built and review every change; Devin does the tracing, editing and testing.

**Example:** the Chargebacks Power App moves into the console as one pull request. It comes with a table mapping each Power Automate condition to the rule that replaced it, and it flags what has no equivalent. Nothing under the engine changes.

### For KYC and Operations

Ask for the check you do by hand, from the case that needs it, and have it running the same day.

**Example:** analysts look up every UK business on Companies House in another tab. The KYC manager clicks **Ask Devin to add a check** on Thornbury Couriers. After review, the check runs from the case, and a company late with its accounts needs a manager to approve.

**Example:** the disputes team's app, with its deadline alerts and approval flow, becomes a console app worked with the same roles as refunds.

### For Console Admins

Change how approvals work across the console, with a design engineering agreed, and see who can do what without reading a policy.

**Example:** the admin asks for two different approvers on refunds at or above $5,000. A refunds manager sees the same button greyed out: "Only an admin can ask for this".

**Example:** any change Devin made can be taken back out from `/runs` with **Undo this change**, keeping everything built since.

### For Core Engineering

Stop tracing by hand. Review a pull request against a request and a plan committed before the first edit, and keep the final say on every merge.

**Example:** two-person approval is an engine change. Engineering writes the design into the request in two lines: a record per approver, and requests already waiting keep one approval. Devin implements it, and the engine's owner reviews it as well as an engineer.

**Example:** every run passes `pnpm verify` before it can be approved: lint, typecheck, the boundary check that only the engine writes to the database, the run guard that holds the diff to the plan, and 288 tests.

### For Compliance and QA

Every change arrives with its request, its tests and its approvals, in one audit log that answers who changed what, and why.

**Example:** after two-person approval merges, each approver of a large refund writes their own audit row, and the refund's effect is written in the same transaction as the last approval.

**Example:** the audit log records every step of a change: who asked, who approved, the merge, and each approval on a large refund, each row naming who did what and when.

## 3. Scenarios

![Changing a console rule](rule-change-workflow.svg)

Editable source: [`rule-change-workflow.excalidraw`](rule-change-workflow.excalidraw).

Three scenarios, one per demonstration in `LOOM-VIDEO-SCRIPT.md`, one per kind of work. Each touches more of the system than the last: one app, then the engine every app shares, then a new app.

### 1. A check the analysts do by hand

- Replace a manual lookup with a check that runs from the case.
  - Analysts check UK businesses on Companies House in another tab and type the result into the case
  - The KYC manager asks Devin from the case. The request is written in advance, names the outside API and asks Devin to read its docs on the web
  - Devin adds the lookup, records responses for tests, and feeds the result into Declared vs found, where the existing rule holds approval for a manager
  - Thornbury Couriers, approved on a hand-typed check before, now waits for a manager because its accounts are overdue
- **Question it answers:** what happens when requirements change?
- **Traditional:** a premium connector licensed per user, or a ticket that waits for a sprint.
- **Brief:** `COMPANIES_HOUSE_CHECK.md`

### 2. Two people for large refunds

- Change how approvals work, for every app, from engineering's design.
  - One admin can release any refund today, however large
  - Only an admin can ask for this change; a refunds manager sees the button greyed out
  - Devin changes the shared approval engine: a record per approver, nobody twice, never the requester, old requests untouched
  - The engine's owner and an engineer review. After merge, the inbox shows "1 of 2", the same manager can't approve twice, and a KYC manager can't see it
- **Question it answers:** can Devin change the shared platform, not just one app?
- **Traditional:** custom approval logic in every flow that needs it, which nobody maintains.
- **Brief:** `TWO_PERSON_APPROVAL.md`

### 3. Move a Power App across

- Rebuild an app from its Power Apps export.
  - The Chargebacks tile says "Coming soon"; its Power App and two Power Automate flows run the team today
  - The admin asks Devin from that page. Devin gets the export: screens, formulas, flows and 50 disputes
  - Devin writes the tool, turns each flow condition into a rule, and lists each one beside what replaced it
  - The tile goes live, inheriting roles, approvals, masking and audit from the engine
- **Question it answers:** can this hold twenty tools, and who builds the next one?
- **Traditional:** weeks of engineering per app, or keeping the licences.
- **Brief:** `CHARGEBACKS_FROM_POWER_APPS.md`

Every scenario keeps a human gate. In a regulated fintech the gates are the selling point: a change reaches production as fast as a Power Apps edit and still gets a second reviewer.

## 4. Demo pitch

The beat-by-beat script, with what to say and what to click, is `LOOM-VIDEO-SCRIPT.md`.

### The pitch in one paragraph

> Leaving Power Apps means owning your internal tools, and owning them means engineering work that never stops: checks the analysts do by hand, changes to how approvals work, and every app still to move across. With Devin, your engineers don't do that work; they review it. A KYC manager asks for a Companies House check from the case that needs it, and it runs the same day. An admin asks for two approvers on large refunds, from a design engineering agreed, and Devin changes the engine every app shares under your engine owner's review. An admin points Devin at a Power App's export, and it comes back as a console app with every flow condition accounted for. Leaving Power Apps doesn't mean hiring a platform team. Devin does the engineering; your engineers review it.
