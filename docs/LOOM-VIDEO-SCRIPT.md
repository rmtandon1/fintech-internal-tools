# Five-Minute Loom Video Script: Changing Console Rules During Deployment

**The one message.** Once the console is live, every rule change is one request in and one review out. That holds whether the change adds a rule, removes one, or reaches every app.

The video answers the VP's real question: *if we build internal tools with Devin, what does owning them look like six months from now?* The build gets thirty seconds. The three demonstrations get the rest, and each is harder than the last.

| # | Demonstration | Question it answers | Before → after on screen | Who does what |
|---|---|---|---|---|
| 1 | Add a rule nobody predicted | What happens when requirements change? | A Kestrel refund settles → the next one waits for a manager | Refunds manager asks. Devin builds. An engineer approves |
| 2 | Take it back out | What if we want it gone, after the code has moved on? | Refunds held → settling again, with the later change kept | Admin switches it off, then asks. Devin removes. An engineer approves |
| 3 | One requirement, every app | Can Devin change the shared platform, not just one app? | A refund sent with no reason → every privileged action asks for a reason and a ticket | Compliance asks. Devin changes the engine and all three apps. Engine owner and engineer approve |

The ladder: one app → one app on code that has moved on → the engine and every app.

Section timings add up to about six and a half minutes. The title stays at five.

---

## 🎯 Opening (30 seconds)

### Say

> Your team is moving off Power Apps. Picturing the replacement being built is easy. The harder question is what comes after: when risk or compliance changes a requirement six months from now, who changes the software, how fast, and who checks it?
>
> Today there are two answers. A business user edits a flow live, with no diff and nobody reviewing it. Or it becomes a ticket, waits for a sprint, and takes an engineer half a day to trace.
>
> I'll show you a third answer three times, and each one is harder than the last.

### On screen

- The console home at `/`, signed in as Refunds manager. Nothing clicked yet.

---

## 🧱 The Console Devin Built (30 seconds)

### Say

> One engineer built this console with Devin in ten days. The engineer's time went on deciding what to build and reviewing each pull request. Devin wrote the code, including the shared engine and the feature-flags app. It is a proof of concept, not a production deployment, but it runs on 294 tests.
>
> Three live apps, KYC review, refunds and feature flags, share one engine: roles, approvals and one tamper-evident audit log. Adding the flags app meant a new folder, a migration and a line in each registry. The engine didn't change. That's the answer to "can this hold ten tools". The seventeen pending tiles are the same job.
>
> The build is the easy part to believe. What matters is what happens to the rules inside it once people rely on them.

### On screen

- Home grid: three live apps, the pending tiles behind them.
- A five-second cut to two of Devin's merged pull requests on GitHub: #1, *Add governed write path engine*, and #3, which added the flags app without touching the engine.

---

## 🧩 Demo 1: Add a Rule Nobody Predicted (90 seconds)

### Before: the click to remember

- Open `/t/refunds`. The pattern monitor docks bottom-right and prints its finding: **4 refunds from Kestrel Outdoors add up to $1,880**.
- Open the cluster drawer. Four `not_received` refunds at $480, $475, $460 and $465. Each is under the $500 manager line, so each passes on its own.
- On `rfnd_0012`, click **Send to processor**. It goes straight through.

> Each refund is clean. Together they're $1,880 through a line meant to bring in a second person at $500. Nothing stopped that click. Remember it.

### The request is one sentence

- Click **Ask Devin for a rule**. The Devin window opens on the handoff panel.
- Read the sentence aloud, as the refunds manager would:

> Once a merchant's "not received" refunds add up past the manager limit, send them to a manager for approval. Send those customers' KYC approvals to a manager too.

- Point at the rest of the panel: the four amounts, the $500 and score-70 lines, the base commit, and the files Devin may touch. No customer email, no card number.

> This is everything Devin gets: the sentence, the evidence, and where it's allowed to work. No ticket, no spec. Notice what the sentence leaves out: the time window, rejected refunds, exchange rates, which approver. Devin has to work each of those out from the code.

### What Devin did

Skip ahead to the finished run. Its header shows the real wall time.

- **Plan before edit.** The planned files, committed before the first line changed.
- **The files**, each with its +/− lines on screen:
  - `tools/refunds/src/clustering-hold.ts`, new: the rule, and a shared "is this customer in a held cluster" query
  - `tools/refunds/src/index.ts`: the rule placed after `goodwill_approval`, and a window setting with an off value
  - `tools/kyc/src/index.ts`: `linked_refund_hold` on KYC approve
  - two new test files, built from the four Kestrel amounts
  - `apps/console/tests/tools/refunds-clusters.test.ts`: one existing assertion changed
- **Checks.** `pnpm verify` split into Lint, Typecheck, Boundaries and Test, all green. 294 tests before, the new total after.

Point at the changed existing test:

> This test used to say the four Kestrel refunds pass. Now it says they're held. Devin found the old behaviour written down as a test, and changed it on purpose. That's the one line a reviewer reads most carefully.

> Devin didn't add a threshold. It added a concept the system didn't have: refunds summed across one merchant over a rolling window, read from two apps.

### Review and merge

- Switch role to Engineer. Click **Review and approve**.
- The approval dialog fills in row by row: GitHub review submitted, Devin merging, merged, pulled into the console, audit row written.

> A different person approves. Devin can't merge its own request.

### After: the same click

- Switch back to Refunds agent. On `rfnd_0011`, click **Send to processor**. It lands in the manager inbox. The trace names `clustering_hold` and the $1,880 total.
- Open `kyc_0013`, risk score 68, two points under the manager line. **Approve** now needs a KYC manager, and the trace names `linked_refund_hold`.

> Nothing was switched on. The code changed. Today this is an Excel pivot, a ticket and a two-week wait. Here it went live the same day, after about five minutes of review.

---

## ↩️ Demo 2: Take It Back Out (75 seconds)

### The misfire

- A regional courier outage. About sixty genuine `not_received` refunds from Fernhill Home, a long-standing merchant, pile into the manager inbox. The stat strip's awaiting-approval count jumps.

> The rule is doing what it was told, and it's wrong for this merchant.

### Stop it in seconds

- As Admin, open `/admin/policy`. Set `refunds.clustering_window_days` from 14 to 0.
- The next Fernhill refund goes straight through. One audit row records who did it.

> No engineer and no deploy. That covers the next ten minutes. Now take it out of the code properly.

### Remove it from code that has moved on

- Open `/runs`. On the merged Kestrel run, click **Undo this change**, then **Ask Devin to undo it**.

> Since that rule merged, someone added a `partial_delivery` reason code to the same file. A plain `git revert` now conflicts. Devin has to undo what the earlier change meant, and keep the later work.

Skip ahead to the finished reversal and point at three things:

- **The conflict.** `git revert` → conflict in `tools/refunds/src/index.ts` → kept `partial_delivery`, removed `clustering_hold`.
- **The tests.** The rule's tests are removed and named in the plan. No other test is lost. The **Only undo** check is green.
- **What code can't undo.** The pull request lists the held Fernhill refunds for a person to release, and notes the window setting still in the database.

### After

- Approve as Engineer. As Refunds agent, send `rfnd_0013` to the processor. It settles, as it would have before Demo 1.
- Open the reason-code dropdown: `partial_delivery` is still there.

> No flag was added, and none was left behind. If risk wants the rule back, the original request, plan and pull request are all in the repo, and it's the same sentence again.

---

## 🏛️ Demo 3: One Requirement, Every App (90 seconds)

### Before: an audit row with no why

- As Admin, open `/audit` and find the row for the `rfnd_0012` send from Demo 1. It records who, when and how much. It has no reason and no ticket.

> Internal audit samples refunds sent to the processor and asks for the ticket behind each one. There isn't one, in any of the three apps.

### The request

- On that row, click **Ask Devin**. The row is the evidence. Paste compliance's requirement, word for word:

> Every privileged action must record a reason and a ticket reference in the audit chain. Apply it to KYC decisions, refunds, feature-flag changes and policy changes.

- Below it, the three decisions compliance and engineering made first: which actions count as privileged, the ticket format, and that rejections keep their reason but need no ticket.

> A change to the shared platform starts from a real ticket, not a sentence. Those three lines are policy decisions, and Devin shouldn't guess them. Everything else, where the code has to change, is Devin's to find.

### Why this is the hard one

> This isn't one app. It changes the shared engine and all three apps at once. And the repo's own instructions say every write goes through one function. That's true for most writes, not all of them. The console writes audit rows in five places, and a fix in the obvious one covers one of five.

- On the finished run, point at the planned paths: tool actions, approving and rejecting a held request, policy setting edits, and revealing a masked field.

### The gate

- This run changes the engine, so the engine owner approves as well as the engineer.
- Before approving, the reviewer tries each privileged action in the console and runs `/audit/verify`.
- If review caught a missed path, show where, and the fix Devin made in the same session.

> This is where Devin needs the most review. Here is exactly how much it needed.

### After

- **Send to processor** now asks for a reason and a ticket. Enter `RISK-2231`.
- KYC **Approve**, a production flag enable and a policy setting edit all ask too. A rejection still asks only for its reason, because rejecting is the safe direction.
- The new `/audit` row shows the reason and `RISK-2231`.
- Run `/audit/verify`. The whole chain verifies, including every row written before the change.

> One requirement, three apps and the engine, one pull request, one review.

---

## 💷 What Ownership Costs (30 seconds)

### Say

> Here are the three ways to own this. The first two columns are estimates. The last uses the runs you just watched.

| | Power Apps today | Owned code, engineers only | Owned code, with Devin |
|---|---|---|---|
| New rule to production | ~30 minutes, unreviewed | 1–2 weeks, then 4–6 engineer-hours | Same day: Devin's run, then ~5 minutes of review |
| Who checks it | Nobody | An engineer, 30–60 minutes | An engineer, against a plan committed before the first edit |
| Stop a misfire | Another live edit | A hotfix | An admin setting, in seconds |
| Clean up six months on | Nobody owns it | When a ticket gets prioritised | A reviewed removal pull request |
| Next app | Licences, and its own controls | Weeks | A folder, a migration and a registry line |

> You still pay for engineers. You pay them to review, not to trace.

---

## 🔭 Future Improvements (30 seconds)

### Say

> Risk's next sentence is already waiting: hold refunds when three or more go to the same card across different accounts within thirty minutes. The system has no concept of card fingerprints or a thirty-minute window yet. Same workflow: one sentence, one plan, one review.
>
> What this isn't yet: single sign-on, a deployment pipeline, and real connections to your payment processor and KYC vendor. Those are engineering choices you'd make once, and Devin builds against them the same way.
>
> Once the console is live, every rule change is one request in and one review out. That's what owning this looks like.

### On screen

- Back on the refunds queue, with the next sentence typed into the handoff panel and not sent.

---

## 🙋 Questions to Have Ready

Not on camera. Short answers, each backed by something on screen or in the repo.

- **How much engineering did the build take?** Ten days and one engineer. The engineer described each piece and reviewed every pull request; Devin wrote the code. It is a proof of concept, not production-grade, but the engine, approvals and audit log are real code under 294 tests.
- **How does the reviewer know the rule is right if Devin only got a sentence?** The reviewer holds the acceptance criteria: rejected refunds don't count, the window setting at 0 turns the rule off, and so on. They check that Devin's tests cover each one. The criteria live with the reviewer, not in the prompt.
- **Can it hold ten tools?** The flags app added no engine code. Each new tool is a folder, a schema, a seed and two registry lines.
- **Who maintains it?** Your engineers own the engine and review every change. Devin does the tracing, editing and testing. The engine owner signs off on anything that touches shared code.
- **Can we trust it with money?** Every Devin change goes through a pull request a different person approves. CI fails any file outside the plan Devin committed before editing. Operator actions carry maker-checker approval and a hash-chained audit log.
- **What if the request is ambiguous or contradicts existing behaviour?** Devin stops and asks in the run view, and the requester replies there. The reply is recorded on the run.
- **What if Devin misses something?** Demo 3 is the case built to find out. Say what review caught, if anything.
- **Is this the best of several tries?** Say how many runs were made for each demo, and show every result.
- **What if we want a removed rule back?** The request, plan and pull request are in `runs/` and Git history. Ask again.
- **What does a change cost in Devin usage?** Give the ACUs for each recorded run.

---

## 🎬 Recording Plan

### Order

The demos depend on each other's state, so record in this order:

1. `pnpm db:setup` for a clean database. Live mode needs `DEVIN_API_KEY` and `GITHUB_TOKEN` in `.env`.
2. **Demo 1.** Record the before click, then dispatch the real run and record it through to merge.
3. Merge an ordinary pull request that adds the `partial_delivery` reason code to `tools/refunds/src/index.ts`. Demo 2 depends on it.
4. `pnpm db:scenario courier-outage` for the sixty Fernhill refunds.
5. **Demo 2.** The switch-off, then the reversal run.
6. **Demo 3.** The compliance run, with the reviewer-only notes kept out of Devin's reach (see `PRIVILEGED_ACTION_JUSTIFICATION.md`).

### Roles for each beat

| Beat | Role |
|---|---|
| Pattern and request | Refunds manager |
| Before and after clicks | Refunds agent; KYC reviewer for `kyc_0013` |
| Approve any pull request | Engineer |
| Switch-off, undo, compliance request | Admin |

### Numbers to capture

The script never says a number the screen doesn't show. These come from the recorded runs:

| Number | Where it comes from |
|---|---|
| Each run's wall time | The run view header, from the phase durations Devin reports |
| Test total after each run | The run view's Test check |
| ACUs per run | The Devin session page |
| Your own hours on the build | Your time log; only needed for the Q&A |

Already measured: 294 tests in 35 files at `3863b69`, built between 17 and 27 September.

### Honesty on screen

- Every skip-ahead is a cut, and the run view shows Devin's real wall time next to it.
- If any run is a replay rather than live, it says **Replay** on screen.
