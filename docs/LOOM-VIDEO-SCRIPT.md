# 5-Minute Loom Video Script: Devin-Driven Ownership of Platform Tools

## 🎯 Opening (40 seconds)

**▶ SLIDE 1 · Your team asks, Devin builds, an engineer approves.** The recording opens on it.

[Point along the four boxes.]

> "Without a release pipeline, a rule changes one of two ways."
>
> "Someone edits a flow in the browser, live in minutes, unreviewed. Or it's a ticket, and weeks."
>
> "There's another option. Your team asks for a change, Devin builds it, and an engineer approves it."
>
> "I built Solon, this console, with Devin AI: a full-stack operations console for a regulated fintech. Next.js and React in front, a governed engine on SQLite behind it, and only the engine writes to the database."
>
> "The console drives Devin through the Devin v3 API and GitHub's REST API. Devin coordinates the files, runs the test suite, opens the pull request and merges it. The person asking sends one sentence, and an engineer reviews."

[Press → to slide 2.]

---

## 🧭 Power Apps Today (25 seconds)

**▶ SLIDE 2 · Power Apps is five products in one.**

> "Power Apps is five products: an app builder, Dataverse, connectors, Power Automate, and an admin plane."
>
> "Leaving it means owning all five. Everything I show next replaces one, in code your team owns."

| Power Apps gives you | In this console | Where you'll see it |
|---|---|---|
| App builder | Each app is a declared tool on one shared shell | Apps |
| Dataverse | Tables per app, a role check on every action | Throughout |
| Connectors (premium ones licensed per user or per app) | Code that calls the service, key kept on the server | Connectors |
| Power Automate | Rules and approvals on one governed write path | Rules |
| Admin plane | Roles, live rule settings, one audit log | Rules |

**◀ CONSOLE.** [Viewing as Refunds manager, on Home.]

---

## 🧩 Rules: Added, Switched Off, Removed (2 minutes 20 seconds)

### Before

[Point at the three live apps.]

> "Three live apps on one engine. Devin wrote the code; I wrote the specs and reviewed every pull request."
>
> "A check in every build fails if anything but the engine writes to the database."
>
> "First, a change inside an app we already run."

[Open the **Refunds** tile.]

[Open the Kestrel cluster drawer.]

> "Four 'not received' refunds from Kestrel Outdoors, each just under the $500 manager line. Together, $1,880."

[Switch role: Refunds agent.]

[On `rfnd_0013`, click **Send to processor**.]

[It goes straight to **With processor**.]

> "An agent pays one. That takes Kestrel to $925, and it went straight through."

### Ask, build, approve

[Switch role: Refunds manager.]

[Click **Ask Devin for a rule**.]

> "A manager asks Devin for a rule that adds them up."

[Point at the sentence, the four refunds, the two limits.]

[Point at the allowed paths: three files and tests.]

> "One sentence, the four refunds, and three files it may change. No customer emails, no card numbers."
>
> "The edge cases are in a spec only the reviewer sees. Devin is told not to open it, so it has to find them in the code."

[Click **Send to Devin**.]

[Cut to the finished run; read "Took …" aloud.]

> "This took Devin *(time)*. Devin committed its plan first, listing every file it would touch. A check fails the build if it touches any other."

[Point at the changed assertion in `refunds-clusters.test.ts`.]

> "An existing test said all four refunds pass. Devin changed it to three held, in the open."
>
> "*(328)* tests before, *(new total)* after."

[Switch role: Engineer.]

[Click **Review and approve**.]

[Point at "The approver cannot be the requester".]

> "Now I'm the engineer. I play every role here, and the console still refuses the person who asked from approving."

[Click **Approve as engineer**.]

[Point at **Checks** and **Context untouched ✓**.]

> "It also checks the build is green and that Devin worked from the request we sent."

[Let the rows fill in, down to the audit row.]

[Close the dialog; click **Pull merged code**.]

> "Merged isn't live yet. An engineer pulls it into the running console."

### Held

[Switch role: Refunds agent.]

[On `rfnd_0011`, click **Send to processor**.]

[The banner reads **Sent to manager for approval**.]

> "Back to the agent, and the next Kestrel refund. The same click now waits for a manager."

[Open the trace: `clustering_hold` and the running total.]

> "The trace names the new rule and how much Kestrel has added up to."

### Switch it off

[Off camera: merge the `partial_delivery` pull request.]

[Off camera: `pnpm db:scenario courier-outage`.]

[Switch role: Refunds manager.]

[Open **Approvals** in the sidebar: 60 Fernhill refunds.]

> "A courier outage. Sixty genuine refunds from a trusted merchant, all held."

[Switch role: Admin.]

[In **Rule settings**, set `refunds.clustering_window_days` to 0.]

[Save; point at the audit row.]

> "Switching it off is a business call, so an admin makes it, not an engineer. Zero means off, and a test proves it. One setting, one audit row, no deploy."

### Remove it

[Open **Rule changes**, then the merged Kestrel run.]

[Click **Undo this change**.]

[Click **Ask Devin to undo it**.]

[Cut to the finished undo.]

> "Undoing it is the hard part. A plain git revert conflicts: a partial-delivery reason code landed in the same file since."

[Point at the conflict: kept `partial_delivery`, removed `clustering_hold`.]

> "Devin kept the later work and took the rule out."

[Point at the removed tests, then the sixty held refunds.]

> "Its tests are named as removed, and the sixty held refunds are listed for a person to release. Nothing else touched."

[As Engineer: approve, merge, **Pull merged code**.]

### Outcome

[Switch role: Refunds agent.]

[On `rfnd_0014`, click **Send to processor**.]

[It goes straight to **With processor**.]

> "The agent's click goes straight through again."

[Open the trace, then the reason-code dropdown.]

> "No trace of the rule, and partial delivery is still in the list."

---

## 🔎 Connectors: Automating a Manual Step (60 seconds)

### Before

[Switch role: KYC reviewer.]

[Open `kyc_0104`, Thornbury Couriers Ltd.]

> "That change stayed inside the console. This one reaches outside it, to a government register."

[Point at the registry check: "Checked by hand".]

[Point at the **Approve** preview: every rule passes.]

> "Thornbury's registry check was typed by hand, at onboarding. One click approves this business today."

### Ask, build, approve

[Switch role: Admin.]

[Click **Ask Devin to add a check**.]

> "Adding a check to onboarding is an admin's request, not the reviewer's."

[Point at **What Devin will see**: name, number, country.]

> "Devin gets the company's public registration, no person's data, and a request to read the Companies House docs itself."

[Click **Send to Devin**.]

[Cut to the finished run; read "Took …" aloud.]

[Point at the files, then the client's `GET /company/{number}`.]

> "*(Five)* files, all in the KYC app. One call per case, a *(five)*-second timeout, the key kept on the server."
>
> "No answer, an error, an unknown number: it says 'couldn't check' and holds."
>
> "There's no live key in this demo. Tests replay recorded responses, and the screen says 'test data'."

[As Engineer: approve, merge, **Pull merged code**.]

[Switch role: Admin.]

[In **Rule settings**, set `kyc.companies_house_check` to 1.]

> "It merged switched off. An admin turns it on."

### Outcome

[Switch role: KYC reviewer.]

[On `kyc_0104`, run the Companies House check.]

[Click **Approve**.]

> "Companies House says the company is late with its accounts. The same click now waits for a manager, and says why."

---

## 📦 Apps: Starting the Next One (70 seconds)

### Before

> "Both of those changed an app that already exists. This time there's no app yet."

[Switch role: Admin.]

[On Home, open **Chargebacks** under Coming soon.]

[Point at the sample rows.]

> "Chargebacks still runs in a Power App, with two Power Automate flows."

[Point at **Included automatically**.]

> "Nobody has built it yet, and it already has roles, approvals, live settings and an audit log."

### Ask, build, approve

[Click **Ask Devin to start this app**.]

[Point at the export: seven files.]

> "Two screens, two flows, fifty disputes. I'm asking for the first pull request, not the whole app."

[Click **Send to Devin**.]

[Cut to the finished run; read "Took …" aloud.]

[Open the pull request description on GitHub.]

> "This took Devin *(time)*. Every formula and flow step in the export is listed, done or still to do."

[Point at the file list: nothing under `packages/`.]

> "*(Fifteen)* files. A new table, nothing under the engine, and the roles and approvals came with it."

[As Engineer: approve, merge, **Pull merged code**.]

[Switch role: Admin.]

[In **Feature flags**, enable `app.chargebacks`.]

### Outcome

[Switch role: Refunds agent.]

[Open the **Chargebacks** tile on Home.]

[Point at "Over $1,000, due within 48 hours": 3.]

> "The refunds team has a live queue. The hourly email is now a count: three due in 48 hours."

[On `DSP-20401`, click **Accept**.]

[It waits for a manager.]

> "A $2,480 fraud accept waits for a manager, as it did in Power Apps. The rest of the move is that list."

---

## 🔧 Challenge: Post-Merge Deployment Drift (30 seconds)

**Differentiator:** a real problem from the build, diagnosed layer by layer and fixed in four.

[Show the Chargebacks **Pull merged code** toast screenshot.]

> "One challenge from the build: post-merge deployment drift."
>
> "GitHub said merged, and the screen didn't change."
>
> "I walked it down layer by layer. The merge commit wasn't in the console's checkout."
>
> "Pulling wasn't enough either. The new Chargebacks package didn't resolve."

[Cut to the four-layer table in `docs/POST_MERGE_DEPLOYMENT_DRIFT.md`.]

> "So the sync has four layers. It confirms the merge with GitHub, and pulls only when nobody has local edits."
>
> "It installs packages when the dependency list changes. Then it migrates and registers new settings and flags."
>
> "That toast is all four, with no restart and no re-seed."

---

## 💷 What It Costs (20 seconds)

**▶ SLIDE 3 · What it costs.** The slide carries the table below.

> "There are three ways to run this."

| | Power Apps today | Your engineers | Your engineers + Devin |
|---|---|---|---|
| Adding a rule | About 30 minutes, no one checks it | 1–2 weeks | Same day, checked by an engineer |
| Turning a rule off | Edit it live | Ship a fix | Flip a switch in settings |
| Removing a rule | Rarely happens | Waits for a ticket | Devin removes it and an engineer checks |
| Adding an app | More licences | Weeks of work | One pull request to start, security built in |

> "You still need engineers. They check the work instead of writing it."

[Press → to slide 4.]

---

## ⚖️ Build or Buy (60 seconds)

**▶ SLIDE 4 · Build or buy.** Stay on it to the end.

[Point at **What the demo proves**.]

> "Here's what the demo proves. Rules can be added, turned off and removed, and an engineer checks every change. The same goes for connectors and new apps."

[Point at **What it doesn't prove**.]

> "Here's what it doesn't prove. Login, hosting, backups and support still need to be built."
>
> "Business users also can't make changes themselves any more. Every change goes through an engineer."

[Point at **Risks**.]

> "There are three main risks. Power Apps formulas that nobody documented might work differently once they're moved."
>
> "Reviews could get rushed as the number of changes goes up."
>
> "And engineering and hosting costs could cancel out the licence savings. We don't have real numbers for that yet."

[Point at **Next 90 days**.]

> "So I'd recommend building it yourselves, one app at a time, but only if you can put one engineer in charge of it."
>
> "Start with Chargebacks. Run it alongside the Power App, then decide: does it match, how long do reviews take, and what does each change cost?"

[Point at **Where Devin fits**.]

> "If you build, Devin writes the changes and your engineers review them. If you stay on Power Apps, Devin can still build custom connectors and write tests and documentation."

---

## Before Recording

The recording runs just under eight minutes; ▶ SLIDE and ◀ CONSOLE cues mark switches between the deck and the app and are never said.

**A day ahead, before the runs:**

- [ ] `pnpm devin:playbook` if `.devin/run-protocol.playbook.md` changed
- [ ] For every run: watch until it opens its pull request, answer at once if it asks
- [ ] For every run: note its time, files, lines, test total and ACUs

**The runs, in this order:**

- [ ] Kestrel rule: add it, approve, merge
- [ ] Check the Kestrel session never opened the spec
- [ ] Merge the `partial_delivery` reason code in `tools/refunds/src/index.ts` (must land after the rule, or the undo won't conflict)
- [ ] Confirm the conflict with `git revert --no-commit` in a scratch worktree
- [ ] `pnpm db:scenario courier-outage`, then switch the rule off
- [ ] Undo the Kestrel rule, approve, merge
- [ ] Companies House check, then the Chargebacks first pull request

**On the day:**

- [ ] `git fetch --tags`, then `git checkout -B cognition-dashboard-devin-integration <demo-tag>` (stay on the branch; a detached HEAD breaks **Pull merged code**)
- [ ] `pnpm install`
- [ ] `git status` clean (delete stray `runs/` folders)
- [ ] Within the hour: stop `pnpm dev`, `pnpm db:reset`, `pnpm dev` (rebuilds demo data but keeps the recorded runs, their audit rows and replays)
- [ ] Pick a role again only after `rm -rf apps/console/data` — `pnpm db:reset` keeps the role cookie
- [ ] `.env` has `DEVIN_API_KEY` and `GITHUB_TOKEN`
- [ ] `/api/devin/status` reports `live` (if not, stop)
- [ ] `pnpm verify` green (328 tests)
- [ ] Fresh browser window, 1440×900, notifications off
- [ ] `docs/DEMO-SLIDES.html` open in a second window, same size, on slide 1

---

## Shot List

Clicks marked **once** change data; retake with `pnpm db:seed` (it won't undo `pnpm db:scenario courier-outage`).

| # | Shot | Viewing as | State it needs |
|---|---|---|---|
| 0 | Slide 1 for the opening; then slide 2, Power Apps is five products in one | — | Deck open on slide 1 |
| 1 | Home, three live apps | Refunds manager | Fresh seed at the tagged demo commit |
| 2 | Kestrel drawer; `rfnd_0013` send (**once**) | Refunds manager, Refunds agent | Before the Kestrel merge |
| 3 | Handoff, finished run, approval dialog and its trace | Refunds manager, Engineer | Recorded run |
| 3a | `rfnd_0011` send (**once**), **Sent to manager for approval**, trace | Refunds agent | Kestrel rule merged and pulled |
| 4 | Approvals list of sixty; switch-off in Rule settings | Refunds manager, Admin | Courier scenario run |
| 5 | Undo, finished undo; `rfnd_0014` send (**once**), trace, reason dropdown | Admin, Engineer, Refunds agent | `partial_delivery` merged before the undo |
| 6 | Thornbury before, handoff, finished run, setting on, **Approve** | KYC reviewer, Admin, Engineer | Companies House run recorded |
| 7 | Chargebacks Coming soon, handoff, pull request, flag on, queue, `DSP-20401` **Accept** (**once**) | Admin, Engineer, Refunds agent | Chargebacks run recorded; screenshot the **Pull merged code** toast |
| 8 | Toast screenshot, then the four-layer table in `docs/POST_MERGE_DEPLOYMENT_DRIFT.md` | — | Screenshot from shot 7 |
| 9 | Slide 3, what it costs; then slide 4, build or buy | — | Deck on slide 3 |

Show every sped-up run with its real "Took …" time.

---

## After Recording

- [ ] Chapters: Opening, Power Apps today, Rules, Connectors, Apps, Deployment drift, Cost, Build or buy
- [ ] Description, with the one message ("your team asks, Devin builds, an engineer approves"), `docs/DEMO-SLIDES.pdf`, the repo link, the five pull requests, and each run's time, ACUs and test total
- [ ] Copy each `apps/console/data/replays/<run_id>.json` to `runs/<run_id>/replay.json` and commit
- [ ] Stop running Devin sessions
- [ ] Delete stray `runs/` folders
- [ ] Reset the database
- [ ] Tag the recorded commit (e.g. `loom-2026-09-28`)
