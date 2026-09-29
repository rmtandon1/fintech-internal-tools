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

The comparison is on slide 2 of `docs/DEMO-SLIDES.html`; refer to it rather than reading the table here.

**◀ CONSOLE.** [Viewing as Refunds manager, on Home.]

---

## 🧩 Rules: Added, Switched Off, Removed (2 minutes 20 seconds)

### Before

[Point at the three live apps.]

> "Three live apps on one engine. Devin wrote the code; I wrote the specs and reviewed every pull request."
>
> "Every write goes through the engine. There's a test that makes sure of it — and it fails the build if anything tries to go around."
>
> "First, a change inside an app we already run."

[Open the **Refunds** tile.]

[Open the Kestrel cluster drawer.]

> "Four 'not received' refunds from Kestrel Outdoors, each just under the $500 manager line. Together, $1,880."

[Switch role: Refunds agent.]

[On `rfnd_0013`, click **Send to processor**.]

[It goes straight to **With processor**.]

> "An agent pays one. $460, under the line, straight through. Nothing stopped it."

### Ask, build, approve

[Switch role: Refunds manager.]

[Click **Ask Devin for a rule**.]

> "A manager asks Devin for a rule that adds them up."

[Point at the sentence, the four refunds, the two limits.]

[Point at the allowed paths: three files and tests.]

> "One sentence, the four refunds, and three files it may change. No customer emails, no card numbers."
>
> "The spec with the edge cases goes to the reviewer — and Devin is told not to open it."

[Click **Send to Devin**.]

[Cut to the finished run; read "Took …" aloud.]

> "This took Devin *(time)*. It committed the plan before writing any code — and there's a guard on the run, so touching a file outside that plan fails it."

[Point at the changed assertion in `refunds-clusters.test.ts`.]

> "An existing test said all four refunds pass. Devin changed it to three held."
>
> "*(328)* tests before, *(new total)* after."

[Switch role: Engineer.]

[Click **Review and approve**.]

[Point at "The approver cannot be the requester".]

> "Now I'm the engineer. The person who asked can't approve. That's checked in code every time someone approves."

[Click **Approve as engineer**.]

[Point at **Checks** and **Context untouched ✓**.]

> "It also checks the build is green and that Devin worked from the request we sent."

[Let the rows fill in, down to the audit row.]

[Close the dialog; click **Pull merged code**.]

> "It's merged. An engineer pulls it into the running console."

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

[Open **Audit log** in the sidebar: one row per held Fernhill refund.]

> "They came in overnight as ordinary refund requests. The live rule held each one, and each hold wrote its own audit row."

[Switch role: Admin.]

[In **Rule settings**, set `refunds.clustering_window_days` to 0.]

[Save; point at the audit row.]

> "Zero means off, and a test proves it. One setting, one audit row, no deploy."

### Remove it

[Open **Rule changes**, then the merged Kestrel run.]

[Click **Undo this change**.]

[Click **Ask Devin to undo it**.]

[Cut to the finished undo.]

> "Undoing it is the hard part. A plain git revert conflicts, because a partial-delivery reason code has since gone into the same file."

[Point at the conflict: kept `partial_delivery`, removed `clustering_hold`.]

> "Devin kept the later work and took the rule out."

[Point at the removed tests, then the sixty held refunds.]

> "Devin lists the tests it removed, and the sixty held refunds for someone to release. Nothing else was touched."

[As Engineer: approve, merge, **Pull merged code**.]

> "The undo gets the same review the rule did."

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

> "It merged switched off. Turning it on is a separate change, with its own audit row."

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

> "The whole app merged behind one flag, switched off. If it doesn't match the Power App, the flag goes back off."

### Outcome

[Switch role: Refunds agent.]

[Open the **Chargebacks** tile on Home.]

[Point at "Over $1,000, due within 48 hours": 3.]

> "The refunds team has a live queue. The hourly email is now a count: three due in 48 hours."

[On `DSP-20401`, click **Accept**.]

[It waits for a manager.]

> "A $2,480 fraud accept waits for a manager, as it did in Power Apps. Everything still to move is listed in the pull request."

---

## 🔧 Challenge: Post-Merge Deployment Drift (30 seconds)

**Differentiator:** a real problem from the build, diagnosed layer by layer and fixed in four.

[Stay on the Chargebacks queue. Nothing new goes on screen.]

> "One challenge from the build: post-merge deployment drift."
>
> "GitHub said merged, and the screen didn't change. The merge commit wasn't in the console's checkout."
>
> "Pulling wasn't enough either. The new Chargebacks package didn't resolve."
>
> "The fix has four steps: confirm the merge actually happened, pull only into a clean checkout, install packages when the lockfile changes, then migrate and register the new settings and flags."
>
> "Now Pull merged code handles it, with no restart and no re-seed."

---

## 💷 What It Costs (20 seconds)

**▶ SLIDE 3 · What it costs.** Refer to the comparison table on the slide.

> "There are three ways to run this."

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

## 📝 Demo Checklist

**Before recording:**

- [ ] A day ahead, do the Devin runs in order:
  - [ ] Kestrel rule
  - [ ] `partial_delivery` pull request, after the rule
  - [ ] Undo conflicts on `git revert --no-commit`
  - [ ] Courier outage scenario, then switch the rule off
  - [ ] Undo the Kestrel rule
  - [ ] Companies House check
  - [ ] Chargebacks app
- [ ] Note each run's time, ACUs and test total
- [ ] Check out the demo tag on the branch
- [ ] `pnpm db:reset` within the hour
- [ ] `/api/devin/status` reads `live`
- [ ] `pnpm verify` green
- [ ] Browser at 1440×900
- [ ] Slide deck open in a second window

**During recording:**

- [ ] Follow the ▶ SLIDE and ◀ CONSOLE cues
- [ ] Show each run's real "Took …" time
- [ ] Click `rfnd_0013`, `rfnd_0011`, `rfnd_0014`, `DSP-20401` only once
- [ ] Keep it under eight minutes

**After recording:**

- [ ] Add chapter timestamps in comments
- [ ] Link the GitHub repo in the description
- [ ] Link `docs/POST_MERGE_DEPLOYMENT_DRIFT.md` in the description for the deployment drift challenge
- [ ] List the five pull requests with time and ACUs
- [ ] Attach `docs/DEMO-SLIDES.pdf`
- [ ] Tag: #devin #ai-automation
- [ ] Stop Devin sessions and reset the database
- [ ] Tag the recorded commit
