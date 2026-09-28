# Five-Minute Loom Video Script: Changing Console Rules During Deployment

**The one message.** Today a rule change is either fast or reviewed. With Devin it's both: live the same day, and an engineer approves every line.

| # | Demonstration | Question it answers | Before → after on screen |
|---|---|---|---|
| 1 | Add a rule nobody predicted | What happens when requirements change? | A Kestrel refund settles → the next one waits for a manager |
| 2 | Take it back out | What if we want it gone, after the code has moved on? | Refunds held → switched off in seconds → the rule gone from the code, with later work kept |
| 3 | One requirement, every app | Can Devin change the shared platform, not just one app? | A refund sent with no reason → every privileged action asks for a reason and a ticket |

Each demo is harder than the last: one app, then one app on code that has moved on, then the engine and every app.

Section timings add up to about six and a half minutes. Lines in *🎬 italics* are stage directions, not narration.

---

## 🎯 Opening (30 seconds)

*🎬 Before recording: `rm -rf apps/console/data && pnpm db:setup`, then `pnpm dev`. `.env` holds `DEVIN_API_KEY` and `GITHUB_TOKEN`, and the header reads "Devin connected", not SIM. Role: Refunds manager, on `/`.*

### Say

> I'm going to show you what owning an internal tool looks like after it goes live. Not the build. The six months after it.
>
> Right now a rule changes one of two ways. Someone edits a Power Automate flow in the browser: live in thirty minutes, no diff, nobody checks it. Or it becomes a ticket: one to two weeks in the queue, then four to six hours of an engineer tracing code.
>
> Fast or reviewed. You pick one. I'm going to show you both at once, three times, and each one is harder than the last.

---

## 🧱 The Console Devin Built (30 seconds)

### Say

> This is the console. I decided what each piece should do and reviewed every pull request. Devin wrote the code.
>
> Three live apps: KYC review with 101 cases, refunds with 14, and 11 feature flags. They share one engine. Every write goes through the same six steps, validate, idempotency, policy, approval, effect, audit, in one database transaction. 294 tests hold it together.
>
> Here's what that buys app number four. *(open Transaction monitoring)* Nobody has written a line of it yet, and it already has seven things: role access, a check on every action, approvals, live settings, no double actions, masked personal data and a tamper-evident audit log. When Devin added the flags app, the commit touched 11 files and added 1,728 lines. None of them were in the engine.
>
> Seventeen more tiles, same job. But the build isn't really the question. The rules inside it are.

### On screen

- Home: the three live apps, "Coming soon" below.
- Click **Transaction monitoring**. Point at the **Included automatically** panel.

*🎬 Optional three-second cut: commit `73d64d8` on GitHub, 11 files, no engine path in the list.*

---

## 🧩 Demo 1: Add a Rule Nobody Predicted (90 seconds)

### Before: the click to remember

*🎬 Role: Refunds manager, on `/t/refunds`. Wait for the pattern monitor to finish printing before speaking over it.*

> I'm on the refunds queue. Fourteen refunds. Give it a second, the pattern monitor in the corner is still scanning.

- The monitor prints **4 refunds from Kestrel Outdoors add up to $1,880**. Open the cluster drawer.

> Four "not received" refunds from one merchant: $465, $460, $475 and $480. The manager line is $500, so each one passes on its own. Together it's $1,880. Payments people have a name for this: structuring. You split the money so no single piece gets a second look.
>
> And lowering the limit doesn't fix it. Drop it to $400 and every honest $450 refund lands on a manager's desk, while the next person splits into five refunds of $390.

*🎬 Switch role: Refunds agent.*

- On `rfnd_0013`, click **Send to processor**. It settles.

> That's $925 from this merchant across two refunds, and it went straight through. Remember that click.

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

*🎬 Cut to the finished run. Read the wall time off the run header as it stands.*

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

> Five steps. Lint. Typecheck. Boundaries, which fails if a tool name shows up in the engine or anything but the engine gets the database write handle. The run guard: every changed file was in the plan, nothing in the engine moved, and no test file lost a single test. Then the suite: 294 tests before, *(new total)* after.

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

---

## ↩️ Demo 2: Take It Back Out (75 seconds)

*🎬 Before this demo: merge an ordinary pull request that adds a `partial_delivery` reason code to `tools/refunds/src/index.ts`. Then run `pnpm db:scenario courier-outage`.*

### The misfire

*🎬 Role: Refunds manager, on `/inbox`.*

> A regional courier goes down. Fernhill Home, a merchant we've trusted for years, sends 60 genuine "not received" refunds, `rfnd_1001` to `rfnd_1060`, $30 to $450 each. The rule holds every one of them. That's 60 items in this inbox and 60 audit rows.

### Stop it in seconds

*🎬 Switch role: Admin, on `/admin/policy`.*

- Find `refunds.clustering_window_days`. Change 14 to 0. Save.

> Zero means off. Devin wrote that into the rule, and a test checks it. One field, one save, one audit row. No engineer, no deploy.

*🎬 Role: Refunds agent. Send `rfnd_0012`. It settles, and the trace still lists `clustering_hold`, answering allow.*

> Notice the rule is still in the trace. Switched off isn't removed. That covers the next ten minutes. Now I take it out properly.

### Remove it from code that has moved on

*🎬 Role: Admin, on `/runs`.*

- On the merged Kestrel run, click **Undo this change**, then **Ask Devin to undo it**.

> Since the rule merged, we shipped a `partial_delivery` reason code into the same file. So `git revert` conflicts. Devin has to take out what the rule meant, and keep what came after it.

*🎬 Cut to the finished reversal. Read the wall time off the header.*

- **The conflict.** `git revert` → conflict in `tools/refunds/src/index.ts` → kept `partial_delivery`, removed `clustering_hold`.
- **The tests.** The rule's tests are removed and named in the plan. No other test is lost. **Only undo** is green: every file the original merge touched is back to its pre-merge content, except the later `partial_delivery` work.
- **What code can't undo.** The pull request lists the 60 held Fernhill refunds for a person to release, and the window setting still sitting in the database.

### After

*🎬 Role: Engineer to approve, then Refunds agent.*

- Send `rfnd_0014`. It settles, and `clustering_hold` is gone from the trace entirely.
- Open the reason-code dropdown: `partial_delivery` is still there.

> Switched off, the rule was still in the code, answering allow. Now it's gone. No flag added, none left behind. If risk wants it back, the request, the plan and the pull request are all in the repo. Same sentence again.

---

## 🏛️ Demo 3: One Requirement, Every App (90 seconds)

### Before: an audit row with no why

*🎬 Role: Admin, on `/audit`. Find the `rfnd_0013` send from Demo 1.*

> Internal audit picks a refund at random, this one, $460 to Kestrel, and asks for the ticket that authorised it. The row has who and when. There's no reason and no ticket. Not here, not in KYC, not in flags.

### The request

- On that row, click **Ask Devin**. Paste compliance's requirement, word for word:

> Every privileged action must record a reason and a ticket reference in the audit chain. Apply it to KYC decisions, refunds, feature-flag changes and policy changes.

- Below it, the three calls compliance and engineering made first:
  - Privileged means KYC approve, refunds send, and flag enables and rollouts in production.
  - A ticket looks like `RISK-2231` (`^[A-Z][A-Z0-9]+-\d+$`), or `EMERGENCY`. A reason is 5 to 500 characters.
  - Rejections keep their reason and need no ticket, because rejecting is the safe direction.

> A bigger change gets a real ticket, not a sentence. Those three lines are policy, and Devin shouldn't guess policy. Finding where the code has to change is Devin's job.

### Why this is the hard one

> The console writes audit rows from 8 places in 4 engine files: `execute-intent.ts`, `approvals.ts`, `set-constant.ts` and `pii/reveal.ts`. That's five paths: a tool action, approving a held request, rejecting one, editing a setting, and revealing a masked field. Fix the obvious one and you've covered one of five. The trap is approvals. When a manager approves a held refund, the effect runs again without going back through the front door.

- On the finished run, point at the planned paths. All five should be there.

### The gate

*🎬 Role: Engineer, then show the pull request on GitHub.*

- This run touches the engine. CODEOWNERS names an owner for `packages/engine/`, so GitHub requests the engine owner's review automatically, on top of the engineer's.
- Before approving, the reviewer tries each of the five paths in the console and reads the audit rows it writes.
- If review caught a missed path, show where it was caught and the fix Devin made in the same session.

> This is where Devin needs the most review. Here's exactly how much it needed.

### After

*🎬 Role: Refunds agent.*

- On `rfnd_0006`, click **Send to processor**. It now asks for a reason and a ticket. Enter "Duplicate charge confirmed with the customer" and `RISK-2231`.
- KYC **Approve**, a production flag enable and a policy setting edit all ask as well. A rejection still asks only for its reason.
- The new `/audit` row shows the reason and `RISK-2231`.

*🎬 Role: Admin. Open `/audit`.*

> The audit log shows the whole run in order: the request, the approval and the merge, each row naming who did what and when.

> One requirement, three apps and the engine, one pull request, one review.

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
| Next app | Licences, and its own controls | Weeks | Seven controls inherited on day one |

> You still pay engineers. You pay them to review, not to trace.

---

## 🔭 Future Improvements (30 seconds)

*🎬 Role: Refunds manager. Open the handoff panel and type the next sentence without sending it.*

### Say

> Risk's next sentence is already waiting: hold refunds when three or more go to the same card across different accounts within thirty minutes. The system has no idea what a card fingerprint or a thirty-minute window is yet. Same workflow: one sentence, one plan, one review.
>
> What this isn't yet: single sign-on, a deployment pipeline, and real connections to your payment processor and KYC vendor. Those are decisions you make once, and Devin builds against them the same way.
>
> Fast or reviewed used to be the choice. With Devin, every rule change is both.
