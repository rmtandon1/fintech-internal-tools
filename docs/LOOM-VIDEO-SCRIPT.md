# Loom Video Script: After Power Apps, Rules, Connectors and Apps

**The one message.** After Power Apps, your team asks, Devin builds, and an engineer approves, whether it's a rule, a manual step or a whole new app.

It's one demo: the same loop runs three times, each time on a bigger change. Ask from the screen that shows the need, Devin runs, a different person approves, and the same click behaves differently.

## Client questions

| Part | The client is asking | What answers it on screen |
|---|---|---|
| Power Apps today | What are we paying Power Apps for, and what would we have to own instead? | Power Apps is five products in one; each part of the demo replaces one of them in owned code |
| The console | Is the build itself credible? | Three live apps on one engine, 331 tests, and seven controls every new app inherits |
| 1. Rules: from added to removed | When requirements change, how fast, and who checks it? Can we switch it off, and take it out? | A Kestrel refund settles, then waits for a manager; switched off in seconds; removed from code that has moved on |
| 2. Connectors: automating manual steps | Is this only rules, or real engineering against outside systems? | A hand-typed Companies House check becomes a lookup, on test data here, that holds approval |
| 3. Apps: starting the next one | Can this hold twenty tools? What does the next one cost? | Chargebacks lands as a first pull request, switched off until an admin turns it on, with the rest of the move as a list |

## How to read this script

- **"Quoted lines"** are spoken, word for word. No sentence runs past about twenty words.
- **[Bracketed lines]** are on-screen actions: what to click, open or point at. Nothing in brackets is said.
- *(Parentheses inside a quote)* mark a value you read off the screen, such as a run's time.
- Record ids like `rfnd_0013` appear only in brackets. Spoken lines use names.
- Section timings add up to about seven and a half minutes. Run the **Before recording** checklist at the end first.

---

## 🧭 What Power Apps Gives You Today (35 seconds)

[Show the five-part slide: the table below, one row per product.]

> "Power Apps is five products in one, licensed per user or per app."
>
> "An app builder, for canvas or model-driven apps, in the browser and on mobile."
>
> "Dataverse, a relational database with security down to the row and the column."
>
> "Connectors to outside systems. Many, like calling any web API, need a premium licence."
>
> "Power Automate, the workflow engine behind approvals, alerts and scheduled jobs."
>
> "And an admin plane: environments, data policies, and who can do what."
>
> "Leaving Power Apps means owning all five."
>
> "Each part of this demo replaces one of them, in code your team owns."

| Power Apps gives you | What it does | In this console | Where you'll see it |
|---|---|---|---|
| App builder (canvas or model-driven apps) | Screens and forms, in the browser and on mobile | Each app is a declared tool on one shared shell | The three live apps; Part 3, Apps |
| Dataverse | Relational tables, with row- and column-level security | Tables per app, a role check on every action, masked personal data | Throughout |
| Connectors | Links to outside systems; many are premium, licensed per user | Code that calls the outside service, with the key kept on the server | Part 2, Connectors |
| Power Automate | Workflows: approvals, alerts, scheduled jobs | Rules and approvals on one governed write path | Part 1, Rules |
| Admin plane | Environments, data policies, who can do what | Roles, live rule settings and one audit log | Part 1, Rules |

---

## 🎯 Opening (30 seconds)

[Viewing as Refunds manager, on the home page.]

> "I'm going to show you what owning an internal tool looks like after it goes live."
>
> "Not the build. The six months after it."
>
> "Today a rule changes one of two ways."
>
> "Someone edits a Power Automate flow in the browser. It's live in thirty minutes, and nobody checks it."
>
> "Or it becomes a ticket. One to two weeks in the queue, then half a day of an engineer tracing code."
>
> "Fast or reviewed. You pick one."
>
> "I'll show you a third way, three times: your team asks, Devin builds, an engineer approves."
>
> "First a rule, then a connector that replaces a manual step, then a whole new app."

---

## 🧱 The Console Devin Built (30 seconds)

[Stay on home. Point at the three live apps.]

> "This is the console. I decided what each piece should do and reviewed every pull request."
>
> "Devin wrote the code."
>
> "Three live apps: KYC review with 104 cases, refunds with 14, and 11 feature flags."
>
> "They share one engine. Every write takes the same six steps."
>
> "Validate, idempotency, policy, approval, effect, audit. The change and its audit row save together, or not at all."
>
> "331 tests hold it together."

[Click **Transaction monitoring**, under Coming soon. Point at **Included automatically**.]

> "Nobody has written a line of this app yet. It already has seven things."
>
> "Role access, checks on every action, approvals, live settings, no double actions, masked data, an audit log."
>
> "When Devin added the flags app, it touched eleven files. None of them were in the engine."

[Optional: a three-second cut to commit `73d64d8` on GitHub, eleven files, no engine path.]

> "Seventeen more tiles, same job. But the build isn't the question. What happens after it is."

---

## 🧩 Part 1 · Rules: From Added to Removed (2½ minutes)

One rule, one app: introduce it, switch it off, take it out.

### Introduce it: the click to remember

[Open `/t/refunds`. Wait until the pattern monitor in the corner finishes printing.]

> "This is the refunds queue. Give it a second, the monitor in the corner is still scanning."

[The monitor prints "4 refunds from Kestrel Outdoors add up to $1,880". Open the cluster drawer.]

> "Four 'not received' refunds from one merchant: $465, $460, $475 and $480."
>
> "The manager line is $500, so each one passes on its own. Together it's $1,880."
>
> "It's the refund version of structuring. You split the money so no piece gets a second look."
>
> "Lowering the limit doesn't fix it. At $400, every honest $450 refund lands on a manager's desk."
>
> "And the next person just splits into five refunds of $390."

[Switch role: Refunds agent. On `rfnd_0013`, click **Send to processor**. It settles.]

> "That's $925 from this merchant, and it went straight through. Remember that click."
>
> "The refunds manager wants a rule. They spotted the split and can't stop it today."
>
> "So does the head of risk, who wants this loss closed before month-end."

### The request is one sentence

[Switch role: Refunds manager. In the drawer, click **Ask Devin for a rule**.]

[Read the prefilled request aloud from the panel: "Once a merchant's 'not received' refunds add up past the manager limit, send them to a manager for approval. Send those customers' KYC approvals to a manager too."]

[Point down the panel: the four refunds, the $500 and score-70 limits, the start commit, the allowed folders.]

> "This is everything Devin gets. The sentence, the four refunds, the two limits, and where it may work."
>
> "No customer emails. No card numbers. No ticket, no spec."
>
> "What the sentence leaves out is the interesting part."
>
> "How far back to look. Whether rejected refunds count. Which approver."
>
> "Kestrel also has a goodwill refund and two faulty ones. Those mustn't count."
>
> "There's a spec with those answers. It goes to the reviewer, not to Devin."

[Optional: open the Devin session in a second tab. The prompt names no spec.]

[Click **Send to Devin**.]

### What Devin did

[Cut to the finished run. Read the time from "Took …" above the timeline.]

> "I'll skip ahead. This took Devin *(time)*. Here's what it did."

[Point at the plan: the file list, committed before the first edit.]

> "The plan comes first. The file list was committed before a single line changed."

[Point at each file with its +/− lines.]

> "A new rule file. A window setting, fourteen days, where zero means off. A KYC rule. New tests."

[Point at `apps/console/tests/tools/refunds-clusters.test.ts`, one existing assertion changed.]

> "This is the line I'd read first as a reviewer."
>
> "An existing test said all four Kestrel refunds pass. Now three of them are held."
>
> "Devin found the old behaviour written down, and changed it on purpose, in the open."

[Point at `pnpm verify`, one check at a time.]

> "Five checks. Lint, typecheck, and a boundary check that only the engine writes to the database."
>
> "The run guard: every change was in the plan, and nothing in the engine moved."
>
> "Then the suite: 331 tests before, *(new total)* after."

### Review and merge

[Switch role: Engineer. Click **Review and approve**.]

> "I'm the engineer now. A different person from the one who asked."
>
> "Neither Devin nor the refunds manager can approve this. Devin merges only after I do."

[Point at the checklist in the dialog: the eight behaviours from the spec.]

> "This checklist is the spec. It came to me, not to Devin. I check there's a test for each of the eight."

[Click **Approve as engineer**. Let the rows fill in: GitHub review, Devin merging, merged, pulled in, audit row.]

### After: the same kind of click

[Switch role: Refunds agent. On `rfnd_0011`, click **Send to processor**.]

> "Same merchant, same click. This $480 takes Kestrel to $1,880."

[It lands in the manager inbox. Point at `clustering_hold` in the trace.]

> "Held for a manager."

[Switch role: KYC reviewer. Open `kyc_0013`, Noor El-Amin.]

> "Noor's risk score is 68. The manager line is 70, so this used to clear."

[Point at the register row, home in Rotterdam and refund delivered to Utrecht, then the $475 refund below.]

> "The console already had the evidence: the Utrecht delivery, the refund in the Kestrel cluster."

[Click **Approve**. It needs a KYC manager. Point at `linked_refund_hold`.]

> "Now it waits for a manager. Nothing got switched on. The code changed."

### Switch it off: the misfire

[Off camera, before this beat: merge the `partial_delivery` pull request, then run `pnpm db:scenario courier-outage`.]

[Switch role: Refunds manager. Open `/inbox`.]

> "A regional courier goes down."
>
> "Fernhill Home, a merchant we've trusted for years, sends sixty genuine 'not received' refunds."
>
> "The rule holds every one. Sixty items in this inbox."
>
> "The refunds ops lead wants it off. So does support, fielding customers whose refunds are stuck."
>
> "And Fernhill's account manager, whose best merchant is being treated like a suspect."

### Stop it in seconds

[Switch role: Admin. Open `/admin/policy`. Set `refunds.clustering_window_days` from 14 to 0. Save.]

> "Zero means off. Devin wrote that into the rule, and a test checks it."
>
> "One field, one save, one audit row. No engineer, no deploy."

[Switch role: Refunds agent. On `rfnd_0012`, click **Send to processor**. It settles.]

[Point at `clustering_hold` still in the trace, answering allow.]

> "The rule is still in the trace. Switched off isn't removed."
>
> "When the courier's back, the admin sets it to fourteen again. It's back on."
>
> "But suppose risk wants something narrower: the same card, across accounts, within thirty minutes."
>
> "Then this rule should go. So should any rule that's switched off for good."

### Remove it: from code that has moved on

[Switch role: Admin. Open `/runs`. On the merged Kestrel run, click **Undo this change**, then **Ask Devin to undo it**.]

> "Since the rule merged, we shipped a partial-delivery reason code into the same file."
>
> "So a plain git revert conflicts."
>
> "Devin has to take out what the rule meant, and keep what came after it."

[Cut to the finished undo. Read "Took …".]

[Point at the conflict line: kept `partial_delivery`, removed `clustering_hold`.]

> "Here's the conflict it resolved. The later work stays. The rule goes."

[Point at the removed tests, named in the pull request.]

> "The rule's tests are removed and named. No other test is lost."

[Point at the list of what code can't undo.]

> "And what code can't undo: sixty held refunds, listed for a person to release."

### After it's gone

[Switch role: Engineer. Approve, and let Devin merge. Then switch to Refunds agent. On `rfnd_0014`, click **Send to processor**.]

> "It settles, and the rule is gone from the trace entirely."

[Open the reason-code dropdown. Point at `partial_delivery`.]

> "The later work is still here. No flag added, none left behind."
>
> "If risk wants the rule back, the request, plan and pull request are all in the repo."

---

## 🔎 Part 2 · Connectors: Automating Manual Steps (75 seconds)

Same loop, bigger change: outside data replaces a lookup people do by hand.

### Today

[Switch role: KYC reviewer. Open `/t/kyc/kyc_0104`, Thornbury Couriers Ltd.]

> "Thornbury Couriers, a UK business opening an account to pay its drivers."
>
> "Risk score 34. Sanctions clear. Documents complete."

[Point at the company registry check: "Checked by hand: active, directors match".]

> "And this check was typed by hand."
>
> "For every UK business, an analyst opens Companies House in another tab and reads the filings."
>
> "Power Apps could call the API, but only with a premium connector licensed per user."
>
> "So nobody does."

[Point at the rule preview for **Approve**: every rule passes. There's no Devin button on the page.]

> "One click approves this customer today. And as a reviewer, I can't ask Devin for anything."

### The request

[Switch role: Admin. Click **Ask Devin to add a check**.]

[Point at **What Devin will see**: the company name, registration number 09318842, country, and today's check.]

> "Devin gets the company's public registration. Nothing about a person."

[Point at **The request**.]

> "The request names the outside API, and tells Devin to read its documentation on the web."
>
> "I haven't pasted in any documentation."

[Click **Send to Devin**.]

### What Devin did, and after

[Cut to the finished run. Read "Took …".]

> "This took Devin *(time)*."

[Point at the files: the code all inside `tools/kyc/`, plus one test file.]

> "A Companies House client. Recorded responses, so no test calls the live API."
>
> "And a KYC action that writes the result into the case."
>
> "It added no new hold. Approval already waits on a material difference, so it reuses that."

[Switch role: Engineer. Approve, and let Devin merge.]

[Switch role: Admin. Open `/admin/policy`. Set `kyc.companies_house_check` from 0 to 1. Save.]

> "Merged isn't the same as on. The check ships switched off, and an admin turns it on."

[Switch role: KYC reviewer. Back on `kyc_0104`, run the Companies House check, then click **Approve**.]

> "Companies House, test data here, says Thornbury is late with its accounts."
>
> "Now approval waits for a manager, and the reason is on screen."

---

## 📦 Part 3 · Apps: Starting the Next One (90 seconds)

Same loop, biggest change: a new app. Not built to production in a video, but started the way a real migration starts.

### Today

[Switch role: Admin. Open `/roadmap/chargebacks`.]

> "Chargebacks still runs in a Power App, with two Power Automate flows."
>
> "One emails the team lead every hour about big disputes due within 48 hours."
>
> "The other sends any fight over $2,500 to a team lead. The first to respond decides."

### The request

[Click **Ask Devin to start this app**. Point at **What Devin will see**: seven files.]

> "This is the export. Two screens with their formulas, both flows, and fifty disputes."
>
> "I'm not asking for the whole app. I'm asking for the first pull request of the move."
>
> "The queue, its disputes, the deadline alert as a count, and the two riskiest rules."
>
> "Everything else goes on a list."

[Click **Send to Devin**.]

### What Devin did, and after

[Cut to the finished run. Read "Took …". Open the pull request's description on GitHub.]

> "This took Devin *(time)*. Look at the list in the pull request."

[Point at the list: each formula and flow step, done or still to do. Point at the flagged email and auto-close.]

> "Every formula and flow step, marked done or still to do. Nothing is dropped silently."

[Point at the file list: `tools/chargebacks/`, one registry entry, one database migration, nothing under `packages/`.]

> "A new folder, one registry entry, one database migration. Nothing in the engine."

[Switch role: Engineer. Approve, and let Devin merge. Back on home, point at the Chargebacks tile: **Switched off**.]

> "It merged switched off. Nobody sees it until an admin turns it on."

[Switch role: Admin. Open **Feature flags**. On `app.chargebacks`, click **Enable**. Then switch to Refunds agent and open `/t/chargebacks`.]

> "Now the tile is live. The refunds team works it with the roles they already have."

[Point at the count: 3 due within 48 hours.]

> "Three big disputes are due within 48 hours. That's the flow's email, as a number on the queue."

[On `DSP-20401`, the $2,480 fraud dispute, click **Accept**. It waits for a manager.]

> "That's not the finished app. It's the first pull request of the migration."
>
> "What's left is a list of small requests. Each one is the loop you've just watched."

---

## 💷 What Ownership Costs (30 seconds)

[Show the table.]

> "Three ways to own this. The first two columns are estimates. The last is what you just watched."

| | Power Apps today | Owned code, engineers only | Owned code, with Devin |
|---|---|---|---|
| New rule, reviewed and merged | ~30 minutes to live, never reviewed | 1–2 weeks, then 4–6 engineer-hours | Same day: Devin's run, then minutes of review |
| Who checks it | Nobody | An engineer, 30–60 minutes | An engineer, against a plan committed before the first edit |
| Stop a misfire | Another live edit | A hotfix | One admin setting, in seconds |
| Clean up six months on | Nobody owns it | When a ticket gets prioritised | A reviewed removal pull request |
| Automate a manual step | A premium connector per user, or nothing | A ticket and a sprint | Same day, reviewed like any other change |
| Next app | Licences, and its own controls | Weeks | A first pull request, then small requests; seven controls inherited on day one |

> "You still pay engineers. You pay them to review, not to trace."

---

## 🔭 Future Improvements (30 seconds)

[Switch role: Refunds manager. Open the Kestrel drawer and click **Ask Devin for a rule**. Type the next request. Don't send it.]

> "Risk's next request is already waiting: the same card, across accounts, within thirty minutes."
>
> "The system has no idea what a card fingerprint is yet. Same loop: one sentence, one review."
>
> "What this isn't yet: single sign-on, a deployment pipeline, real processor and KYC connections."
>
> "Those are decisions you make once. Devin builds against them the same way."
>
> "After Power Apps, your team asks, Devin builds, and an engineer approves."
>
> "Whether it's a rule, a manual step or a whole new app."

---

## 🧰 Before Recording

Tick each one off. The "Why" column names what went wrong during rehearsal.

### The Devin runs, a day ahead

The five runs take 30–60 minutes each, so record them before the narration takes. Order matters:

1. Kestrel rule: add it, approve, merge.
2. Merge an ordinary pull request that adds a `partial_delivery` reason code to `tools/refunds/src/index.ts`. The undo only conflicts if this lands after the rule.
3. `pnpm db:scenario courier-outage`, then switch the rule off.
4. Undo the Kestrel rule, approve, merge.
5. Companies House check, then the Chargebacks first pull request.

| Check | Why |
|---|---|
| Watch each run until it opens its pull request, and answer at once if it stops to ask | Run `01M3HBQ` stopped to ask about a test outside its allowed files, then suspended for inactivity with nobody answering |
| Every run's allowed files include `apps/console/tests/**` | That same run stalled because the test it had to change wasn't in scope |
| `pnpm devin:playbook` after any change to `.devin/run-protocol.playbook.md` | Devin keeps its old copy until the playbook is re-registered |
| Note each run's "Took …" time, test total and ACUs as it finishes | The script reads these off screen; they're the only numbers not known in advance |

### The machine, on the day

| Check | Why |
|---|---|
| Main checkout on `cognition-dashboard-devin-integration`, then `git pull --ff-only` | Devin's pull requests land on the branch every few minutes; a stale checkout shows old screens |
| `git status` shows nothing unexpected. Delete stray `runs/<id>/` folders from stopped runs | Stray `runs/` folders from `01M3HBQ` and `01M3JBP` sat in the checkout, and the merge sync refuses to pull into a dirty tree |
| Stop `pnpm dev` before resetting the database | Resetting under a running server leaves it reading the deleted file until restart |
| `rm -rf apps/console/data && pnpm db:setup`, then `pnpm dev`, within the hour before recording | Seeded dates count from seed time. An older database showed KYC cases overdue and the Kestrel dates drifted |
| Clear `apps/console/.next` if a route was deleted since the last start | A stale `.next/types` file for the deleted `/api/status` route broke typecheck |
| Pick a role again in the header after a reset | The reset regenerates the secret that signs the role cookie, so the old role no longer works |
| `/runs` shows no stale runs | A stopped Kestrel run lingered in `/runs` and the database until the reset |
| `.env` has `DEVIN_API_KEY` and `GITHUB_TOKEN`, and `/api/devin/status` reports `live` | Without the GitHub token, **Review and approve** and the merge check don't work |
| `pnpm verify` is green, and the test count matches the script (331) | The count changed four times in two days (294, 305, 288, 331) as pull requests landed |
| Browser: a fresh window, 1440×900, zoom 100–110%, notifications off, one theme chosen | Keeps every take the same size and stops pop-ups landing in shot |

---

## 🎥 During Recording: Shot List

One row per shot, in order. Clicks marked **once** change data. To retake them, run `pnpm db:seed`, which restores the demo refunds and cases without touching Devin's runs.

| # | Shot | Viewing as | State it needs |
|---|---|---|---|
| 0 | Five-part slide for "What Power Apps gives you today" | — | The table from that section, as a slide |
| 1 | Home: opening and the console | Refunds manager | Fresh seed; three live apps |
| 2 | Transaction monitoring's Coming soon page | Refunds manager | — |
| 3 | Refunds queue, monitor, cluster drawer | Refunds manager | Before the Kestrel merge |
| 4 | `rfnd_0013` **Send to processor** (**once**) | Refunds agent | Before the Kestrel merge |
| 5 | Handoff panel for the Kestrel rule | Refunds manager | — |
| 6 | Finished Kestrel run, then the approval dialog | Engineer | Recorded run |
| 7 | `rfnd_0011` send (**once**); `kyc_0013` **Approve** | Refunds agent, KYC reviewer | Kestrel rule merged and pulled in |
| 8 | Inbox with sixty Fernhill refunds | Refunds manager | Courier scenario run |
| 9 | Switch-off on `/admin/policy`; `rfnd_0012` send (**once**) | Admin, Refunds agent | — |
| 10 | Undo from `/runs`, finished undo, `rfnd_0014` send (**once**), reason dropdown | Admin, Engineer, Refunds agent | `partial_delivery` merged before the undo |
| 11 | Thornbury Couriers before, handoff, finished run, check switched on at `/admin/policy`, after | KYC reviewer, Admin, Engineer | Companies House run recorded |
| 12 | Chargebacks Coming soon, handoff, pull request, **Switched off** tile, `app.chargebacks` enabled, live queue, `DSP-20401` **Accept** (**once**) | Admin, Engineer, Refunds agent | Chargebacks run recorded |
| 13 | Cost table, then the closing request typed and not sent | Refunds manager | — |

- Pause for a beat after each click so the cut has room.
- Show every sped-up run with its real "Took …" time on screen.
- If Devin isn't connected, stop. Don't record the greyed-out send button.

---

## 📤 After Recording

- **Edit.** Trim the dead air, speed-ramp the run waits, and check each cut shows the real "Took …" time.
- **Chapters.** Add Loom chapters at the real timestamps: Power Apps today, Opening, The console, Part 1 · Rules, Part 2 · Connectors, Part 3 · Apps, What ownership costs, Future.
- **Description.** Paste the one message, then link the repository and the five pull requests (Kestrel add, `partial_delivery`, Kestrel undo, Companies House, Chargebacks).
- **Tags.** In Loom: `devin`, `internal-tools`, `power-apps-migration`. In git: tag the commit you recorded, such as `loom-2026-09-28`.
- **Numbers.** Record each run's time, ACUs and test total in the Loom description, so the claims can be checked.
- **Replays.** Copy each recorded run's `apps/console/data/replays/<run_id>.json` to `runs/<run_id>/replay.json` and commit it, so the demo can be replayed without Devin.
- **Clean up.** Stop any Devin session still running, delete stray `runs/` folders, and reset the database so the next take starts clean.
- **Share.** Check the Loom's sharing settings before sending the link.
