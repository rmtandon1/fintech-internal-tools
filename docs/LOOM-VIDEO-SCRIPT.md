# Five-Minute Loom Video Script: Changing Console Rules During Deployment

**The one message.** After Power Apps, your team asks, Devin builds, and an engineer approves, whether it's a rule, a manual step or a whole new app.

It's one demo: the same loop runs three times, each time on a bigger change. Ask from the screen that shows the need, Devin runs, a different person approves, and the same click behaves differently.

## Client questions

| Part | The client is asking | What answers it on screen |
|---|---|---|
| The console | Is the build itself credible? | Three live apps on one engine, 288 tests, and seven controls every new app inherits |
| 1. A rule, from added to removed | When requirements change, how fast, and who checks it? Can we switch it off, and take it out? | A Kestrel refund settles, then waits for a manager; switched off in seconds; removed from code that has moved on |
| 2. A manual step removed | Is this only rules, or real engineering against outside systems? | A hand-typed Companies House check becomes a live lookup that holds approval |
| 3. The next app, started | Can this hold twenty tools? What does the next one cost? | Chargebacks goes live as a first pull request, with the rest of the move as a list |

Section timings add up to about seven minutes. Lines in *🎬 italics* are stage directions, not narration; the narration uses names, the directions use record ids.

---

## 🎯 Opening (30 seconds)

*🎬 Before recording: `rm -rf apps/console/data && pnpm db:setup`, then `pnpm dev`. `.env` holds `DEVIN_API_KEY` and `GITHUB_TOKEN`, and `/api/devin/status` reports `live`. Viewing as Refunds manager, on `/`.*

### Say

> I'm going to show you what owning an internal tool looks like after it goes live. Not the build. The six months after it.
>
> Right now a rule changes one of two ways. Someone edits a Power Automate flow in the browser: live in thirty minutes, no diff, nobody checks it. Or it becomes a ticket: one to two weeks in the queue, then four to six hours of an engineer tracing code.
>
> Fast or reviewed. You pick one. I'm going to show you a third way, three times: your team asks, Devin builds, an engineer approves. First a rule, then a manual step, then a whole new app.

---

## 🧱 The Console Devin Built (30 seconds)

### Say

> This is the console. I decided what each piece should do and reviewed every pull request. Devin wrote the code.
>
> Three live apps: KYC review with 104 cases, refunds with 14, and 11 feature flags. They share one engine. Every write goes through the same six steps, validate, idempotency, policy, approval, effect, audit, in one database transaction. 288 tests hold it together.
>
> Here's what that buys app number four. *(open Transaction monitoring)* Nobody has written a line of it yet, and it already has seven things: role access, a check on every action, approvals, live settings, no double actions, masked personal data and an audit log. When Devin added the flags app, the commit touched 11 files and added 1,728 lines. None of them were in the engine.
>
> Seventeen more tiles, same job. But the build isn't really the question. What happens after it is.

### On screen

- Home: the three live apps, "Coming soon" below.
- Click **Transaction monitoring**. Point at the **Included automatically** panel.

*🎬 Optional three-second cut: commit `73d64d8` on GitHub, 11 files, no engine path in the list.*

---

## 🧩 Part 1: A Rule, From Added to Removed (2½ minutes)

One rule, one app: introduce it, switch it off, take it out.

### Introduce it: the click to remember

*🎬 Role: Refunds manager, on `/t/refunds`. Wait for the pattern monitor to finish printing before speaking over it.*

> I'm on the refunds queue. Fourteen refunds. Give it a second, the pattern monitor in the corner is still scanning.

- The monitor prints **4 refunds from Kestrel Outdoors add up to $1,880**. Open the cluster drawer.

> Four "not received" refunds from one merchant: $465, $460, $475 and $480. The manager line is $500, so each one passes on its own. Together it's $1,880. Payments people have a name for this: structuring. You split the money so no single piece gets a second look.
>
> And lowering the limit doesn't fix it. Drop it to $400 and every honest $450 refund lands on a manager's desk, while the next person splits into five refunds of $390.

*🎬 Switch role: Refunds agent.*

- On `rfnd_0013`, click **Send to processor**. It settles.

> That's $925 from this merchant across two refunds, and it went straight through. Remember that click.

Who wants this rule, in a sentence each:
- The refunds manager who spotted the split, and has no way to stop it today.
- The head of risk, who wants the loss closed before month-end, not after a sprint.

### The request is one sentence

*🎬 Role: Refunds manager, back in the cluster drawer.*

- Click **Ask Devin for a rule**. Read the sentence aloud:

> Once a merchant's "not received" refunds add up past the manager limit, send them to a manager for approval. Send those customers' KYC approvals to a manager too.

- Point down the handoff panel.

> This is everything Devin gets. The sentence. The four refunds. The two lines it'll run into, $500 on refunds and a risk score of 70 on KYC. The commit it starts from. And the folders it's allowed to touch. No customer emails, no card numbers, no ticket, no spec.
>
> What the sentence leaves out is the interesting part. How far back to look. Whether rejected refunds count. Kestrel also has an £84 goodwill refund and two faulty ones, and those mustn't count. Which approver. Nobody tells Devin any of that. There's a spec with those answers in it, and it goes to the reviewer, not to Devin. Devin works all of it out from the code.

*🎬 Optional: open the Devin session in a second tab. The prompt is the sentence, the kind, `Scope: rule` and the run id; the attachment is `context.json`. No spec path anywhere.*

### What Devin did

*🎬 Cut to the finished run. Read the time off "Took …" above the timeline.*

> I'll skip ahead. This took Devin *(wall time)*. Here's what it did.

- **Plan first.** The file list, committed before the first edit.
- **The files**, each with its +/− lines on screen:
  - `tools/refunds/src/clustering-hold.ts`, new: the rule, plus a shared query that answers "is this customer in a held cluster?"
  - `tools/refunds/src/index.ts`: the rule registered after `goodwill_approval` so the trace reads in order, and a new setting, `refunds.clustering_window_days`, default 14, where 0 means off
  - `tools/kyc/src/index.ts`: `linked_refund_hold` on KYC approve
  - new tests built from the four real amounts
  - `apps/console/tests/tools/refunds-clusters.test.ts`: one existing assertion changed

> That last line is the one I'd read first as a reviewer. This test used to say all four Kestrel refunds preview as allowed. Now three of them preview as held. Devin found the old behaviour written down as a test, and changed it on purpose, in the open.

- **Checks.** Point at `pnpm verify`, step by step.

> Five steps. Lint. Typecheck. Boundaries, which fails if a tool name shows up in the engine or anything but the engine gets the database write handle. The run guard: every changed file was in the plan, the plan stayed in scope and never moved, and nothing in the engine moved. Then the suite: 288 tests before, *(new total)* after.

### Review and merge

*🎬 Switch role: Engineer. Click **Review and approve**.*

> I'm the engineer now, a different person from the one who asked. Neither Devin nor the refunds manager can merge this.

- The dialog lists the eight acceptance tests from the spec, the checklist Devin never saw. Tick them off against the PR's tests.

> This checklist is the spec. It went to me, not to Devin. Eight behaviours; Devin's tests cover all eight.

- Approve. The dialog fills in row by row: review submitted on GitHub, Devin merging, merged, pulled into the console, audit row written.

### After: the same kind of click

*🎬 Role: Refunds agent.*

- On `rfnd_0011`, click **Send to processor**. It lands in the manager inbox, and the trace names `clustering_hold`.

> Same merchant, same click. $465, $460, $475, and this $480 makes $1,880. Held for a manager.

*🎬 Role: KYC reviewer. Open `kyc_0013`.*

- Noor El-Amin: the gauge reads 68 against a manager line of 70. The **Declared vs found** register shows one minor difference: home in Rotterdam, refund delivered to Utrecht. The panel at the bottom shows one refund, $475, not received. That's from the refunds app.
- Click **Approve**. It now needs a KYC manager, and the trace names `linked_refund_hold`.

> Before the merge, a 68 with one minor difference cleared. The console already had the evidence: the Utrecht delivery, the refund in a Kestrel cluster. Now it waits for a manager, because Devin's rule connects that refund to the pattern in a different app. Nothing got switched on. The code changed.

*🎬 Before this beat: merge an ordinary pull request that adds a `partial_delivery` reason code to `tools/refunds/src/index.ts`. Then run `pnpm db:scenario courier-outage`.*

### Switch it off: the misfire

*🎬 Role: Refunds manager, on `/inbox`.*

> A regional courier goes down. Fernhill Home, a merchant we've trusted for years, sends 60 genuine "not received" refunds, `rfnd_1001` to `rfnd_1060`, $30 to $450 each. The rule holds every one of them. That's 60 items in this inbox and 60 audit rows.

Who wants it off, and fast:
- The refunds ops lead, watching the inbox flood during an outage or a peak like Black Friday.
- Support, fielding customers whose refunds are stuck.
- Fernhill's account manager, whose best merchant is being treated like a suspect.

### Stop it in seconds

*🎬 Switch role: Admin, on `/admin/policy`.*

- Find `refunds.clustering_window_days`. Change 14 to 0. Save.

> Zero means off. Devin wrote that into the rule, and a test checks it. One field, one save, one audit row. No engineer, no deploy.

*🎬 Role: Refunds agent. Send `rfnd_0012`. It settles, and the trace still lists `clustering_hold`, answering allow.*

> Notice the rule is still in the trace. Switched off isn't removed. When the courier's back, the admin sets it to 14 again and the rule is back on. But suppose risk decides it's too blunt.

Who wants it gone:
- Risk, replacing it with a narrower rule: the same card, across different accounts, within thirty minutes.
- Engineering, six months on, when nobody wants a rule that's switched off for good.

### Remove it: from code that has moved on

*🎬 Role: Admin, on `/runs`.*

- On the merged Kestrel run, click **Undo this change**, then **Ask Devin to undo it**.

> Since the rule merged, we shipped a `partial_delivery` reason code into the same file. So `git revert` conflicts. Devin has to take out what the rule meant, and keep what came after it.

*🎬 Cut to the finished reversal. Read "Took …" above the timeline.*

- **The conflict.** `git revert` → conflict in `tools/refunds/src/index.ts` → kept `partial_delivery`, removed `clustering_hold`.
- **The tests.** The rule's tests are removed and named in the PR. No other test is lost. Every file the original merge touched is back to its pre-merge content, except the later `partial_delivery` work, and the guard confirms nothing outside the plan changed.
- **What code can't undo.** The pull request lists the 60 held Fernhill refunds for a person to release, and the window setting still sitting in the database.

### After it's gone

*🎬 Role: Engineer to approve, then Refunds agent.*

- Send `rfnd_0014`. It settles, and `clustering_hold` is gone from the trace entirely.
- Open the reason-code dropdown: `partial_delivery` is still there.

> Switched off, the rule was still in the code, answering allow. Now it's gone. No flag added, none left behind. If risk wants it back, the request, the plan and the pull request are all in the repo. Same sentence again.

---

## 🔎 Part 2: A Manual Step Removed (75 seconds)

Same loop, bigger change: outside data replaces a lookup people do by hand.

### Today

*🎬 Role: KYC reviewer. Open `/t/kyc/kyc_0104`.*

> Thornbury Couriers, a UK business opening an account to pay its drivers. Risk score 34, sanctions clear, documents complete. And the company registry check says "Checked by hand: active, directors match".
>
> For every UK business, an analyst opens Companies House in another tab, types in the registration number and reads the filings. Power Apps could call the API, but only through the premium HTTP connector, licensed for every user who runs it. So nobody does.

- Point at the rule preview for **Approve**: every rule passes. And there's no Devin button on this page for a reviewer.

### The request

*🎬 Switch role: Admin. Click **Ask Devin to add a check**.*

- Point at **What Devin will see**: the company's name, registration number 09318842, country and today's hand-typed check. Nothing about a person.
- Point at **The request**: it names the outside API and tells Devin to read the Companies House docs on the web itself.

> I haven't pasted any documentation. Devin reads the API docs, builds the lookup, and records responses so no test calls the live API.

### What Devin did, and after

*🎬 Cut to the finished run. Read "Took …" above the timeline. Approve as Engineer.*

- The files, all inside `tools/kyc/`: a Companies House client, recorded responses, and a KYC action that writes the result into the case. It reuses the `declared_vs_found` rule rather than adding one.

*🎬 Role: KYC reviewer, back on `kyc_0104`. Run the new Companies House check, then click **Approve**.*

> Companies House, labelled test data here, says Thornbury Couriers is late with its accounts. Approval now waits for a manager, and the reason is on screen. An hour ago this was one click from approved on a check someone typed at onboarding.

---

## 📦 Part 3: The Next App, Started (90 seconds)

Same loop, biggest change: a new app. Not built to production in a video, but started the way a real migration starts.

### Today

*🎬 Role: Admin. Open `/roadmap/chargebacks`.*

> Chargebacks still runs in a Power App on a SharePoint list, with two Power Automate flows. One emails the team lead every hour about disputes over $1,000 due within 48 hours. The other sends any fight over $2,500 to a team lead, and the first to respond decides.

### The request

- Click **Ask Devin to start this app**. Point at **What Devin will see**: the export, seven files: two screens with their formulas, both flows, and 50 disputes.

> This isn't "build the whole app". It's the first pull request of the move: the queue with its disputes, the 48-hour alert as a count, and the two riskiest rules. Everything else goes on a list.

### What Devin did, and after

*🎬 Cut to the finished run. Read "Took …". Open the pull request's description, then approve as Engineer.*

- Point at the list: every formula and flow step, marked done in this pull request or still to do. The hourly email and the automatic close are on it, flagged as having no equivalent yet.
- Point at the file list: everything under `tools/chargebacks/`, one registry line, one migration. Nothing under `packages/`.

*🎬 Role: Refunds agent. Open `/t/chargebacks`.*

> The tile is live. The refunds team works it with the roles they already have. The count says three disputes over $1,000 are due within 48 hours: the flow's email, as a number on the queue. Accept the $2,480 fraud dispute, and it waits for a manager.
>
> That's not the finished app. It's the first pull request of the migration, and what's left is a list of small requests, each one the same loop you've just watched.

---

## 💷 What Ownership Costs (30 seconds)

### Say

> Here are the three ways to own this. The first two columns are estimates. The last one is what you just watched.

| | Power Apps today | Owned code, engineers only | Owned code, with Devin |
|---|---|---|---|
| New rule to production | ~30 minutes, unreviewed | 1–2 weeks, then 4–6 engineer-hours | Same day: Devin's run, then minutes of review |
| Who checks it | Nobody | An engineer, 30–60 minutes | An engineer, against a plan committed before the first edit |
| Stop a misfire | Another live edit | A hotfix | One admin setting, in seconds |
| Clean up six months on | Nobody owns it | When a ticket gets prioritised | A reviewed removal pull request |
| Remove a manual step | A premium connector per user, or nothing | A ticket and a sprint | Same day, reviewed like any other change |
| Next app | Licences, and its own controls | Weeks | A first pull request, then small requests; seven controls inherited on day one |

> You still pay engineers. You pay them to review, not to trace.

---

## 🔭 Future Improvements (30 seconds)

*🎬 Role: Refunds manager. Open the handoff panel and type the next sentence without sending it.*

### Say

> Risk's next sentence is already waiting: hold refunds when three or more go to the same card across different accounts within thirty minutes. The system has no idea what a card fingerprint or a thirty-minute window is yet. Same workflow: one sentence, one plan, one review.
>
> What this isn't yet: single sign-on, a deployment pipeline, and real connections to your payment processor and KYC vendor. Those are decisions you make once, and Devin builds against them the same way.
>
> After Power Apps, your team asks, Devin builds, and an engineer approves, whether it's a rule, a manual step or a whole new app.
