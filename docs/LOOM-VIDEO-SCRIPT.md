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

**◀ CONSOLE.** [Viewing as Manager, on Home.]

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

[Switch role: Analyst.]

[On `rfnd_0013`, click **Send to processor**.]

[It goes straight to **With processor**.]

> "An analyst pays one. $460, under the line, straight through. Nothing stopped it."

### Ask, build, approve

[Switch role: Manager.]

[Click **Ask Devin for a rule**.]

[Type the first words, press Tab.]

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

[On **Rule changes**, click the top row, the one with the PR number, to open its run in the Devin panel.]

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

[Switch role: Analyst.]

[`rfnd_0011` is no longer in the refunds queue; **With a manager** counts it.]

> "Back to the analyst. The next Kestrel refund has left their queue, and nobody clicked anything."

[Switch role: Manager. Open `rfnd_0011` in the manager's queue, then the trace: `clustering_hold` and the running total.]

> "It's in the manager's queue, and the trace says why: the new rule, and how much Kestrel has added up to."

> "The rule itself is a sum. The work is everything around it: the KYC side, a switch to turn it off, tests, review, and later an undo that keeps what came after."

### Switch it off

[Off camera: merge the `partial_delivery` pull request.]

[Off camera: `pnpm db:scenario courier-outage`.]

[Switch role: Manager.]

[Open **Refunds**: 60 Fernhill refunds need your approval.]

> "A courier outage. Sixty genuine refunds from a trusted merchant, all in the manager's queue."

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

[Point at the removed tests, then the sixty routed refunds.]

> "Devin lists the tests it removed, and the sixty routed refunds still in the manager's queue for someone to pay or reject. Nothing else was touched."

[As Engineer: approve, merge, **Pull merged code**.]

> "The undo gets the same review the rule did."

### Outcome

[Switch role: Analyst.]

[`rfnd_0014` is back in the analyst's queue; click **Send to processor**.]

[It goes straight to **With processor**.]

> "The analyst's click goes straight through again."

[Open the trace, then the reason-code dropdown.]

> "No trace of the rule, and partial delivery is still in the list."

---

## 🔎 Connectors: Automating a Manual Step (60 seconds)

### Before

[Switch role: Analyst.]

[Open `kyc_0104`, Wilko Limited.]

> "That change stayed inside the console. This one reaches outside it, to a government register — every day."

[Point at the registry check: "Checked by hand at onboarding: active", dated 2021.]

[Point at the five Wilko refunds on `/t/refunds`, each settling straight through.]

> "Wilko was checked once, when it was onboarded. UK rules want ongoing monitoring; nobody has looked since. Wilko is in liquidation today under a new name — and its five 'not received' refunds still pay straight through."

### Ask, build, approve

[Switch role: Admin.]

[Click **Ask Devin to monitor merchants**.]

[Type the first words, press Tab.]

> "One sentence, written like a ticket: recheck approved UK merchants daily, and send an insolvent one and its refunds to a manager."

[Point at **What Devin will see**: name, number, country.]

> "How to build it — the key, the timeout, failing closed, shipping switched off — is in the repo's house rules, not the prompt."

[Click **Send to Devin**.]

[Cut to the finished run; read "Took …" aloud.]

[Point at the files: the case link migration, the scheduler, the refund rule.]

> "This one had to build three things that didn't exist: refunds only carry a merchant name, so a migration links them to the KYC case; there was no scheduler, so the daily recheck runs as an audited system actor; and refund rules couldn't read KYC."
>
> "A failed lookup flags the case for a manager without holding its refunds. Tests replay recorded responses — no live call."

[As Engineer: approve, merge, **Pull merged code**.]

[Switch role: Admin.]

[In **Rule settings**, set the merchant monitoring setting to 1, then click **Recheck now**.]

> "It merged switched off. Turning it on is a separate change, with its own audit row."

### Outcome

[Point at the recheck result: "4 UK merchants checked · 1 in liquidation · 5 refunds sent to a manager".]

[Open `kyc_0104`: Declared vs found shows declared "Wilko Limited, active", found "WL REALISATIONS (2023) LIMITED, liquidation".]

[Open `/t/refunds` as Manager: the five Wilko refunds wait for review.]

> "Wilko is flagged with its live status, and its refunds wait for a manager. Lakeland, Timpson and Screwfix checked clean — nothing changed for them."

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

[Switch role: Analyst.]

[Open the **Chargebacks** tile on Home.]

[Point at "Over $1,000, due within 48 hours": 3.]

> "The refunds team has a live queue. The hourly email is now a count: three due in 48 hours."

[On `DSP-20401`, click **Accept**.]

[It waits for a manager.]

> "A $2,480 fraud accept waits for a manager, as it did in Power Apps. Everything still to move is listed in the pull request."

---

## 🔧 Challenge: GitHub Approval Drift (30 seconds)

**Differentiator:** a real problem from the build, traced from GitHub back to the run record and fixed in four layers, each through the same governed write path.

[Stay on the Chargebacks queue. Nothing new goes on screen.]

> "One challenge from the build: approvals that went around the console."
>
> "Engineers review on GitHub. One approved a pull request there, and the console still said Devin was working. A merge on GitHub never reached the audit log at all."
>
> "For a regulated team, that's merged code nobody recorded approving."
>
> "The fix has four layers. Read the reviews from GitHub on every poll. Map the GitHub login to a console engineer. Run that approval through the same rules as the button, so the requester still can't approve. And if something merges with no approval, record the merge and name the gap."
>
> "Approve in either place, and the record matches GitHub."

Where each layer lives (not read aloud; write-up in `docs/GITHUB_APPROVAL_DRIFT.md`):

- Read GitHub: `listApprovingReviews` in `tools/automation/src/github-api.ts`, polled from `handleGet` in `apps/console/src/lib/devin-route.ts`
- Map the login: `actorForGitHubLogin` and `GITHUB_APPROVER_LOGIN` in `packages/engine/src/actor.ts`
- Same rules: `observeGitHubApproval` in `tools/automation/src/bridge.ts` runs `approve_pr` through `executeIntent` with the button's idempotency key, so `approver_is_not_requester` applies
- Name the gap: `record_merge` from `running` under `merge_without_recorded_approval` in `tools/automation/src/index.ts`

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
  - [ ] Kestrel rule, approved on GitHub as `rmtandon1` rather than in the console; its run reads "Approved on GitHub by @rmtandon1" and merges
  - [ ] `partial_delivery` pull request, after the rule
  - [ ] Undo conflicts on `git revert --no-commit`
  - [ ] Courier outage scenario, then switch the rule off
  - [ ] Undo the Kestrel rule
  - [ ] Merchant monitoring
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
- [ ] Link `docs/GITHUB_APPROVAL_DRIFT.md` in the description for the GitHub approval drift challenge
- [ ] List the five pull requests with time and ACUs
- [ ] Attach `docs/DEMO-SLIDES.pdf`
- [ ] Tag: #devin #ai-automation
- [ ] Stop Devin sessions and reset the database
- [ ] Tag the recorded commit
