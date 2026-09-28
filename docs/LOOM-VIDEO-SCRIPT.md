# Five-Minute Loom Video Script: Changing Console Rules During Deployment

**The one message.** Leaving Power Apps doesn't mean hiring a platform team. Devin does the engineering; your engineers review it.

Owning internal tools means three kinds of work that never stop. The video shows one of each, and each touches more of the system than the last.

| # | Demonstration | The work | Before → after on screen | Who can ask |
|---|---|---|---|---|
| 1 | A check the analysts do by hand | A request from the people who use a tool | A reviewer approves Thornbury Couriers on a hand-typed check → a Companies House check holds it for a manager | Not the reviewer |
| 2 | Two people for large refunds | A change to how every app works | One admin releases $14,500 alone → the next large refund needs two different approvers | Admin only |
| 3 | Move a Power App across | One of the seventeen apps still to come | Chargebacks says "Coming soon" → it's live, rebuilt from its Power Apps export | Admin only |

One app, then the engine every app shares, then a new app. Section timings add up to about six and a half minutes. Lines in *🎬 italics* are stage directions, not narration. The narration uses names; the directions use record ids so the presenter can find them.

---

## 🎯 Opening (30 seconds)

*🎬 Before recording: `rm -rf apps/console/data && pnpm db:setup`, then `pnpm dev`. `.env` holds `DEVIN_API_KEY` and `GITHUB_TOKEN`, and `/api/devin/status` reports `live`. Viewing as Admin, on `/`.*

### Say

> You're moving your internal tools off Power Apps. Building the replacements is the part everyone pictures. I want to show you the part after: owning them.
>
> Owning means three kinds of engineering work that never stop. The people who use a tool ask for a new check. Someone changes how approvals work across every tool. And there's always another Power App to move across.
>
> Today that's either a flow somebody edits in the browser, live and unreviewed, or a ticket that waits two weeks for an engineer. I'll show you one of each kind of work, done by Devin and reviewed by an engineer.

---

## 🧱 The Console Devin Built (30 seconds)

### Say

> This is the console. I decided what each piece should do and reviewed every pull request. Devin wrote the code.
>
> Three live apps: KYC review with 104 cases, refunds with 15, and 11 feature flags. They share one engine. Every write goes through the same six steps, validate, idempotency, policy, approval, effect, audit, in one database transaction, and 288 tests hold it together.
>
> *(open Chargebacks, under Coming soon)* Here's what that buys the next app. Nobody has written a line of Chargebacks yet, and it already has seven things: role access, a check on every action, approvals, live settings, no double actions, masked personal data and an audit log. Hold that thought. It comes back at the end.

### On screen

- Home: three live apps, seventeen under "Coming soon".
- Click **Chargebacks**. Point at the **Included automatically** panel.

---

## 🔎 Demo 1: A Check the Analysts Do by Hand (90 seconds)

### Today

*🎬 Role: KYC reviewer. Open `/t/kyc/kyc_0104`.*

> Thornbury Couriers, a UK business opening an account to pay its drivers. Risk score 34. Sanctions clear, documents complete. And the company registry check says "Checked by hand: active, directors match".
>
> That's how it works today. For every UK business, an analyst opens Companies House in another tab, types in the registration number and reads the filings. In Power Apps you could automate it, but calling an outside API from a flow needs the premium HTTP connector, licensed for every user who runs it. So nobody does.

- Point at the rule preview for **Approve**: every rule passes.

> One click and this customer is approved. Remember that.

### The request

> As a reviewer I can't ask for changes: there's no Devin button on this page. *(switch role)* Viewing as the admin, there is.

*🎬 Switch role: Admin. Click **Ask Devin to add a check**.*

- Point at **What Devin will see**: the company name, registration number 09318842, country, status and today's hand-typed check.

> This is everything Devin gets from the console: the company's public registration, and nothing about a person. No email, no ID document.

- Point at **The request**.

> The request was written in advance, and I can edit it. It names the outside API, says what counts as a problem (dissolved, in liquidation, or late with its accounts) and tells Devin to read the Companies House docs on the web itself. I haven't pasted in any documentation.

- Click **Send to Devin**.

### What Devin did

*🎬 Cut to the finished run. Read the time off "Took …" above the timeline.*

> I'll skip ahead. This took Devin *(time)*. Here's what it did.

- **Plan first.** The files, committed before the first edit, all inside `tools/kyc/`.
- **The files**, each with its +/− lines: a Companies House client, recorded responses so no test calls the live API, and a KYC action that writes the result into the case's checks and Declared vs found.
- **Reuse.** It didn't write a new rule. The `declared_vs_found` rule already holds approval when a difference is material.
- **Checks.** `pnpm verify`, five steps: Lint, Typecheck, Boundaries, Run guard, Test. 288 tests before, *(new total)* after.

> Two things I'd check as a reviewer: the key never reaches the browser, and when Companies House is down the case is held, not waved through. Both have tests.

### Review and merge

*🎬 Switch role: Engineer. Click **Review and approve**, then approve.*

> I'm the engineer now, a different person from who asked. The dialog fills in: review on GitHub, Devin merging, merged, pulled into the console, audit row written.

### After

*🎬 Role: KYC reviewer, back on `/t/kyc/kyc_0104`. Run the new Companies House check.*

> Same company, same reviewer. Companies House, labelled test data here, says Thornbury Couriers is late with its accounts. That's now a material row in Declared vs found.

- Click **Approve**. It waits for a manager, and the trace names `declared_vs_found`.

> An hour ago this was one click from approved on a check someone typed at onboarding. Now it waits for a manager, and the reason is on screen.

---

## 👥 Demo 2: Two People for Large Refunds (90 seconds)

### Today

*🎬 Role: Refunds agent. Open `/t/refunds/rfnd_0004` and click **Send to processor**.*

> Harbour Point Capital, a $14,500 duplicate. Over the $5,000 admin limit, so it waits for an admin.

*🎬 Switch role: Admin. Approve it in `/inbox`.*

> One person, one click, $14,500 out of the door. In Power Automate, that's the approval step's "first to respond" option. The other option, "everyone must approve", means every person on the list. What a regulator actually wants, any two people but never the one who asked, is custom logic in every flow that needs it.

### The request

*🎬 Role: Refunds manager. Open `/t/refunds/rfnd_0015`, Meridian Air Charters, $8,400.*

> Here's another large refund. The refunds manager sees the button, greyed out: "Only an admin can ask for this". This changes how approvals work for every app, so it's the admin's call.

*🎬 Switch role: Admin. Click **Ask Devin for a second approver**.*

- Point at **The request**.

> This one carries a design. Engineering agreed it before anyone asked Devin: each approver gets their own record, nobody approves the same request twice, and requests already waiting keep the rule they were made under. Devin shouldn't guess a data model for money. It implements the one we chose.

- Open **Technical details**. Point at the allowed files: the engine packages are in scope.

> This one touches the engine, so the engine's owner reviews it as well as an engineer.

### What Devin did

*🎬 Cut to the finished run. Read "Took …".*

> I'll skip ahead. This took Devin *(time)*.

- **The files:** the approval engine in `packages/engine/src/approvals.ts`, one migration, the refunds rule asking for two, and the inbox showing progress.
- **Checks:** all five green, and *(new total)* tests, including one per rule: two different approvers apply it, the same one twice is refused, the requester is refused, an old request still needs one.

*🎬 Show the pull request on GitHub for a few seconds: the review request to the engine's owner, from CODEOWNERS, beside the engineer's.*

*🎬 Role: Engineer. Approve and let it merge.*

### After

*🎬 Role: Refunds agent. Send `rfnd_0015` to the processor.*

> Same kind of refund. It waits: 0 of 2.

*🎬 Role: Refunds manager. Approve it in `/inbox`.*

> 1 of 2. *(click Approve again)* And again: refused. You can't be both approvals.

*🎬 Role: KYC manager. Open `/inbox`.*

> The KYC manager doesn't see it at all. Approvals stay in their own domain.

*🎬 Role: Admin. Approve it.*

> Second person. Now it goes to the processor. Two approval rows and the refund in the audit log, and I didn't write a line of it.

---

## 📦 Demo 3: Move a Power App Across (90 seconds)

### Today

*🎬 Role: Admin. Open `/roadmap/chargebacks`.*

> Chargebacks. Today the disputes team works it in a Power App on a SharePoint list, with two Power Automate flows. Every hour, one of them emails the team lead about disputes over $1,000 due within 48 hours, and closes the ones that missed their deadline. The other sends any fight over $2,500 to a team lead, and the first to respond decides.

### The request

- Click **Ask Devin to build this app**. Point at **What Devin will see**: the export, seven files.

> This is the export: two screens with their formulas, both flows, and 50 disputes. The request says to rebuild it as a console app, turn every condition in the flows into a rule, and list each one next to what replaced it.

> Only an admin can ask for a new app. It adds a table, so it gets the engine owner's review too.

- Click **Send to Devin**.

### What Devin did

*🎬 Cut to the finished run. Read "Took …". Then open the pull request's description.*

> I'll skip ahead again. This took *(time)*. Look at the table in the pull request.

- Point at the mapping: each formula and flow step beside the rule that replaced it.
  - Accepting a fraud dispute over $500 now needs a refunds manager.
  - Fighting over $2,500 needs a refunds manager's approval.
  - You can't fight without evidence.
  - Every decision needs a note.
- Point at the flagged rows: the hourly email and the automatic close have no equivalent in the console, and the pull request says so.

> That's the part I care about in a migration: nothing dropped silently. Where there's no equivalent, it says so and a person decides.

- Point at the file list: everything under `tools/chargebacks/`, one registry line, one migration. Nothing under `packages/`.

*🎬 Role: Engineer. Approve and let it merge.*

### After

*🎬 Role: Admin. Open home.*

> Chargebacks has moved from Coming soon to Live.

*🎬 Role: Refunds agent. Open `/t/chargebacks`.*

> The refunds team works it with the roles they already have. The count at the top says three disputes over $1,000 are due within 48 hours: the flow's email, as a number on the queue.

- Open the $2,480 fraud dispute and click **Accept**. It waits for a refunds manager.

> Remember the seven things from the start: roles, approvals, audit. It didn't build them. It got them.

---

## 💷 What Ownership Costs (30 seconds)

### Say

> Here are the three ways to own this. The first two columns are estimates. The last one is what you just watched.

| | Power Apps today | Owned code, engineers only | Owned code, with Devin |
|---|---|---|---|
| A new check or rule | ~30 minutes if a flow can do it, unreviewed | 1–2 weeks, then 4–6 engineer-hours | Same day: Devin's run, then minutes of review |
| A change to every app | Custom logic in every flow | A project | One pull request, reviewed by the engine's owner |
| The next app | Licences, and its own controls | Weeks | Rebuilt from its export, seven controls inherited |
| Who checks it | Nobody | An engineer, 30–60 minutes | An engineer, against a plan committed before the first edit |

> You still pay engineers. You pay them to review, not to trace.

---

## 🔭 Future Improvements (30 seconds)

*🎬 Role: Admin, on home, with the sixteen remaining Coming soon tiles in view.*

### Say

> Sixteen more tiles, and each is the same job as Chargebacks: an export, a request, a review.
>
> Two things I haven't shown. Upkeep: the next major framework version lands once for all these apps, because they share one app shell, and that's a Devin run too. And what this isn't yet: single sign-on, a deployment pipeline, and real connections to your payment processor and KYC vendor. Those are decisions you make once, and Devin builds against them the same way.
>
> Leaving Power Apps doesn't mean hiring a platform team. Devin does the engineering; your engineers review it.
