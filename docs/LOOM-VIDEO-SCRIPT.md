# 5-Minute Loom Video Script: Devin-Driven Ownership of Platform Tools

**The one message.** After Power Apps, your team asks, Devin builds, and an engineer approves, whether it's a rule, a manual step or a whole new app.

One loop, three times, each on a bigger change. Every part ends on what an operator sees change.

## How to read this script

- **"Quoted lines"** are spoken, word for word. **[Bracketed lines]** are on-screen actions, never said.
- *(Parentheses inside a quote)* are values read off the screen. Where one holds a figure, it's the dry run's (#61, #62, reverted in #63). Say what the screen shows.
- Record ids like `rfnd_0013` appear only in brackets. Spoken lines use names.
- **▶ SLIDE n** means switch to that slide in the deck. **◀ CONSOLE** means switch back to the app. Neither is said.
- Just over seven minutes. Run **Before recording** first.

## Slides

Four slides in [`DEMO-SLIDES.html`](DEMO-SLIDES.html) (PDF copy: [`DEMO-SLIDES.pdf`](DEMO-SLIDES.pdf)). Open the deck in its own window on slide 1 before you record. → and ← move between slides; F toggles full screen.

| Slide | Show it | Move on |
|---|---|---|
| 1 · Power Apps is five products in one | First shot of the recording | After "in code your team owns." Press → to slide 2 |
| 2 · Your team asks, Devin builds, an engineer approves | Opening | After "an engineer approves it." ◀ CONSOLE, on home |
| 3 · What it costs | After the deployment drift challenge | After "instead of writing it." Press → to slide 4 |
| 4 · Build or buy | Straight after slide 3 | Stay on it to the end of the recording |

## Why this order

Each part changes more of the system than the one before.

| | 1 · Rules | 2 · Connectors | 3 · Apps |
|---|---|---|---|
| Where Devin may work | 3 files, plus tests | The KYC app's folder, `.env.example`, tests | A new app folder, registry, schema, home, migrations, lockfile, flag seed, tests |
| New moving parts | A 14-day window setting | An outside API, a key on the server, a timeout, "couldn't check" | A new table (migration `0009`), 50 seeded disputes, two limits, a feature flag |
| Size | One new file, two edited | Dry run: 5 files, +856 −3 | Dry run: 14 files, +2,166 −2 (1,375 of it a generated snapshot) |
| Ends on | A Kestrel refund goes straight to the processor again after the rule is removed | Thornbury's **Approve** waits for a KYC manager, with the reason | A refunds agent works a live Chargebacks queue |

The undo in Part 1 is the trickiest git work in the video, a conflicting revert. It stays there because it's the same rule's life, on the smallest surface.

---

## 🧭 Power Apps Today (25 seconds)

**▶ SLIDE 1 · Power Apps is five products in one.** The recording opens on it.

> "Power Apps is five products: an app builder, Dataverse, connectors, Power Automate, and an admin plane."
>
> "Leaving it means owning all five. Each part of this demo replaces one, in code your team owns."

| Power Apps gives you | In this console | Where you'll see it |
|---|---|---|
| App builder | Each app is a declared tool on one shared shell | Part 3, Apps |
| Dataverse | Tables per app, a role check on every action | Throughout |
| Connectors (premium ones licensed per user or per app) | Code that calls the service, key kept on the server | Part 2, Connectors |
| Power Automate | Rules and approvals on one governed write path | Part 1, Rules |
| Admin plane | Roles, live rule settings, one audit log | Part 1, Rules |

[Press → to slide 2.]

---

## 🎯 Opening (20 seconds)

**▶ SLIDE 2 · Your team asks, Devin builds, an engineer approves.** Point along the four boxes.

> "Without a release pipeline, a rule changes one of two ways."
>
> "Someone edits a flow in the browser, live in minutes, unreviewed. Or it's a ticket, and weeks."
>
> "There's another option. Your team asks for a change, Devin builds it, and an engineer approves it."

**◀ CONSOLE.** [Viewing as Refunds manager, on the home page.]

---

## 🧱 The Console (25 seconds)

[Point at the three live apps.]

> "Three live apps on one engine. Devin wrote the code; I wrote the specs and reviewed every pull request."
>
> "Only the engine writes to the database. A check in every build fails if anything else tries."

[Click **Transaction monitoring**, under Coming soon. Point at **Included automatically**.]

> "An app nobody has built yet. It already has roles, approvals, live settings and an audit log."
>
> "You'll see that happen for real in Part 3."

---

## 🧩 Part 1 · Rules: Added, Switched Off, Removed (2 minutes)

**Differentiator:** the whole life of a rule, each step reviewed or reversible, including taking it out of code that has moved on.

### Before

[Open `/t/refunds`, then the Kestrel cluster drawer.]

> "Four 'not received' refunds from one merchant, each just under the $500 manager line. Together, $1,880."

[Switch role: Refunds agent. On `rfnd_0013`, click **Send to processor**. It goes straight to **With processor**, no hold.]

> "That takes Kestrel to $925, and it went straight through."

### Ask, build, approve

[Switch role: Refunds manager. Click **Ask Devin for a rule**. Point at the sentence, the four refunds, the two limits, and the allowed paths: three files and tests.]

> "One sentence, the four refunds, and three files it may change. No customer emails, no card numbers."
>
> "The spec with the edge cases goes to the reviewer. Devin's prompt tells it not to open it."

[Click **Send to Devin**. The run page polls every 2 seconds. Cut to the finished run; read "Took …".]

> "This took Devin *(time)*. The plan was committed before any code. The run guard fails any file outside it."

[Point at `refunds-clusters.test.ts`, one existing assertion changed.]

> "An existing test said all four Kestrel refunds pass. Devin changed it to three held, in the open."
>
> "*(328)* tests before, *(new total)* after."

[Switch role: Engineer. Click **Review and approve**. Point at the eight-line checklist. After approving, point at the rules the approval passed: `approver_is_not_requester`, `checks_green`, `context_matches_dispatch`. Check in rehearsal where they show; if they don't, cut the two lines below.]

> "I play every role here. The console still refuses the person who asked from approving."
>
> "It also checks the build is green and that Devin worked from the request we sent."

[Click **Approve as engineer**. Let the rows fill in: Approving review, Devin merging, Merged, Audit row. Close the dialog and click **Pull merged code**; the toast reads `pulled … → …`.]

> "Merged isn't live yet. An engineer pulls it into the running console."

### Switch it off

[Off camera: merge the `partial_delivery` pull request, then `pnpm db:scenario courier-outage`. Switch role: Refunds manager. Open `/inbox`: 60 Fernhill refunds held.]

> "A courier outage. Sixty genuine refunds from a trusted merchant, all held."

[Switch role: Admin. `/admin/policy`: `refunds.clustering_window_days` from 14 to 0. Save. Point at the audit row.]

> "Zero means off, and a test proves it. One setting, one audit row, no deploy."

### Remove it

[On `/runs`, the merged Kestrel run: **Undo this change**, **Ask Devin to undo it**. Cut to the finished undo.]

> "A plain git revert conflicts: a partial-delivery reason code landed in the same file since."

[Point at the conflict line: kept `partial_delivery`, removed `clustering_hold`. Then the removed tests, named, and the list of sixty held refunds for a person to release.]

> "Devin kept the later work and took the rule out. Its tests are named as removed. Nothing else lost."

[Switch role: Engineer. Approve, let Devin merge, then click **Pull merged code**.]

### Outcome

[Switch role: Refunds agent. On `rfnd_0014`, click **Send to processor**. It goes straight to **With processor**. Open the trace, then the reason-code dropdown.]

> "The agent's click goes straight through again. No trace of the rule, and partial delivery is still in the list."

---

## 🔎 Part 2 · Connectors: Automating a Manual Step (60 seconds)

**Differentiator:** real engineering against an outside system: an API, a secret, and a failure path that holds rather than passes.

### Before

[Switch role: KYC reviewer. Open `kyc_0104`, Thornbury Couriers Ltd. Point at the company registry check: "Checked by hand: active, directors match". Point at the **Approve** preview: every rule passes.]

> "This registry check was typed by hand, at onboarding. One click approves this business today."

### Ask, build, approve

[Switch role: Admin. Click **Ask Devin to add a check**. Point at **What Devin will see**: company name, registration number 09318842, country. No person's data.]

> "Devin gets the company's public registration, and a request to read the Companies House docs itself."

[Click **Send to Devin**. Cut to the finished run; read "Took …". Point at the files, then the client: `GET /company/{number}` on `api.company-information.service.gov.uk`, the key sent as HTTP Basic, the timeout.]

> "*(Five)* files, all in the KYC app. One call per case, a *(five)*-second timeout, the key kept on the server."
>
> "No answer, an error, an unknown number: it says 'couldn't check' and holds."
>
> "There's no live key in this demo. Tests replay recorded responses, and the screen says 'test data'."

[Switch role: Engineer. Approve, let Devin merge, then click **Pull merged code**. Switch role: Admin. `/admin/policy`: `kyc.companies_house_check` from 0 to 1.]

> "It merged switched off. An admin turns it on."

### Outcome

[Switch role: KYC reviewer. On `kyc_0104`, run the Companies House check, then click **Approve**.]

> "Companies House says Thornbury is late with its accounts. The same click now waits for a manager, and says why."

---

## 📦 Part 3 · Apps: Starting the Next One (70 seconds)

**Differentiator:** a new app from a Power Apps export, as a first pull request plus an honest list of what's left.

### Before

[Switch role: Admin. Open `/roadmap/chargebacks`: Coming soon, sample rows.]

> "Chargebacks still runs in a Power App, with two Power Automate flows."

### Ask, build, approve

[Click **Ask Devin to start this app**. Point at the export: seven files.]

> "Two screens, two flows, fifty disputes. I'm asking for the first pull request, not the whole app."

[Click **Send to Devin**. Cut to the finished run; read "Took …". Open the pull request description on GitHub.]

> "This took Devin *(time)*. Every formula and flow step is listed, done or still to do."

[Point at the file list: `tools/chargebacks/`, a registry entry, migration `0009`, one flag row, nothing under `packages/`.]

> "*(Fifteen)* files. A new table, and nothing under the engine. It still gets roles, approvals and the audit log."

[Switch role: Engineer. Approve, let Devin merge, then click **Pull merged code**; it installs the new `@console/tool-chargebacks` package. Switch role: Admin. In **Feature flags**, enable `app.chargebacks`.]

### Outcome

[Switch role: Refunds agent. Open `/t/chargebacks`. Point at "Over $1,000, due within 48 hours": 3. On `DSP-20401`, the $2,480 fraud dispute, click **Accept**. It waits for a manager.]

> "The refunds team has a live queue. The hourly email is now a count: three due in 48 hours."
>
> "A $2,480 fraud accept waits for a manager, as it did in Power Apps. The rest of the move is that list."

---

## 🔧 Challenge: Post-Merge Deployment Drift (30 seconds)

**Differentiator:** a real problem from the build, diagnosed layer by layer and fixed in four.

[Show the screenshot of the Chargebacks **Pull merged code** toast from Part 3: `pulled … → … · dependencies installed · db migrated`.]

> "One challenge from the build: post-merge deployment drift."
>
> "GitHub said merged, and the screen didn't change."
>
> "I walked it down layer by layer. The merge commit wasn't in the console's checkout."
>
> "Pulling wasn't enough either. The new Chargebacks package didn't resolve."

[Cut to the four-layer table in `docs/POST_MERGE_DEPLOYMENT_DRIFT.md`.]

> "So the sync has four layers. It confirms the merge with GitHub, and pulls only into a clean checkout."
>
> "It installs packages when the lockfile moves. Then it migrates and registers new settings and flags."
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

## 🔍 What a Skeptic Will Ask

Each claim on camera, what backs it, and where to show it. If a line has no evidence, it's worded to match.

| Claim | Evidence | Show or check |
|---|---|---|
| Only the engine writes to the database | The boundary check in `pnpm verify` | The verify line in each run |
| The plan comes first, and Devin can't wander | `plan.json` is committed before any code; the run guard fails any file outside it | The pull request's commit list |
| The requester can't approve | Rule `approver_is_not_requester`; approval also needs `checks_green` and `context_matches_dispatch` | The approval's trace |
| Devin merges only after approval | Devin is told to merge after approval. Branch protection is off on this repo, so GitHub doesn't enforce it | Say it if asked. On a client repo, turn branch protection on |
| Devin never sees the spec | Only an instruction in the prompt; the spec is in the repo | Open the Devin session and show it never opened `docs/REFUND_CLUSTERING_HOLD.md` |
| No customer data goes to Devin | `context.json` holds ids, amounts and company facts only | Open the run's `context.json` |
| Zero switches the rule off | Checklist line 6 has a test | Switch it off on camera |
| A plain revert conflicts | `partial_delivery` merged after the rule | Off camera: `git revert --no-commit <merge>` in a scratch worktree conflicts |
| Nothing else lost on undo | Test total before and after, removed tests named | The undo's verify line |
| The Companies House check is real | Code and tests are real; no live key, so recorded responses | The "test data" label, on screen |
| Every new app inherits the controls | Chargebacks touches nothing under `packages/` and still has approvals and audit | Part 3's file list and `DSP-20401` |
| Nothing dropped from the export | Only as good as the list | The reviewer checks it against the export's seven files |
| Time and cost | Estimates, except the run times read off screen | Put each run's time and ACUs in the Loom description |

---

## 🧰 Before Recording

### The Devin runs, a day ahead

Five runs at 30–60 minutes each. Order matters:

1. Kestrel rule: add it, approve, merge.
2. Merge an ordinary pull request that adds a `partial_delivery` reason code to `tools/refunds/src/index.ts`. The undo only conflicts if this lands after the rule. Confirm with `git revert --no-commit` in a scratch worktree.
3. `pnpm db:scenario courier-outage`, then switch the rule off.
4. Undo the Kestrel rule, approve, merge.
5. Companies House check, then the Chargebacks first pull request.

| Check | Why |
|---|---|
| Watch each run until it opens its pull request; answer at once if it asks | Run `01M3HBQ` stopped to ask, then suspended with nobody answering |
| `pnpm devin:playbook` after any change to `.devin/run-protocol.playbook.md` | Devin keeps its old copy until re-registered |
| Note each run's time, files, lines, test total and ACUs | The script reads these off screen; dry-run figures (#61: 5 files, +856; #62: 14 files, +2,166) will differ |
| Check the Kestrel session never opened the spec | The script says the prompt tells it not to; the session log is the proof if asked |

### The machine, on the day

| Check | Why |
|---|---|
| Main checkout on `cognition-dashboard-devin-integration` at the tagged demo commit: `git fetch --tags`, then `git checkout -B cognition-dashboard-devin-integration <demo-tag>` | The script's app, tile and test counts are read there. Stay on the branch: a detached HEAD makes **Pull merged code** refuse |
| `pnpm install`, and `git status` clean | A new workspace package won't resolve without it; the merge sync refuses a dirty tree, stray `runs/` folders included |
| Stop `pnpm dev`, then `rm -rf apps/console/data && pnpm db:setup`, then `pnpm dev`, within the hour | Seeded dates count from seed time |
| Pick a role again after a reset | The reset regenerates the role cookie's secret |
| `.env` has `DEVIN_API_KEY` and `GITHUB_TOKEN`; `/api/devin/status` reports `live` | Without the GitHub token, approval and the merge check don't work |
| `pnpm verify` green; test count matches the script (328) | The count moved five times in two days (294, 305, 288, 331, 320, 328) |
| Fresh browser window, 1440×900, notifications off | Every take the same size, no pop-ups |

---

## 🎥 Shot List

Clicks marked **once** change data. To retake them, `pnpm db:seed`: it restores the demo refunds and cases, but not after `pnpm db:scenario courier-outage`, whose sixty refunds and audit rows it leaves in place.

| # | Shot | Viewing as | State it needs |
|---|---|---|---|
| 0 | Slide 1, Power Apps is five products in one; then slide 2 for the opening | — | Deck open on slide 1 |
| 1 | Home; Transaction monitoring Coming soon | Refunds manager | Fresh seed at the tagged demo commit |
| 2 | Kestrel drawer; `rfnd_0013` send (**once**) | Refunds manager, Refunds agent | Before the Kestrel merge |
| 3 | Handoff, finished run, approval dialog and its trace | Refunds manager, Engineer | Recorded run |
| 4 | Inbox of sixty; switch-off at `/admin/policy` | Refunds manager, Admin | Courier scenario run |
| 5 | Undo, finished undo; `rfnd_0014` send (**once**), trace, reason dropdown | Admin, Engineer, Refunds agent | `partial_delivery` merged before the undo |
| 6 | Thornbury before, handoff, finished run, setting on, **Approve** | KYC reviewer, Admin, Engineer | Companies House run recorded |
| 7 | Chargebacks Coming soon, handoff, pull request, flag on, queue, `DSP-20401` **Accept** (**once**) | Admin, Engineer, Refunds agent | Chargebacks run recorded; screenshot the **Pull merged code** toast |
| 8 | Toast screenshot, then the four-layer table in `docs/POST_MERGE_DEPLOYMENT_DRIFT.md` | — | Screenshot from shot 7 |
| 9 | Slide 3, what it costs; then slide 4, build or buy | — | Deck on slide 3 |

- Open `docs/DEMO-SLIDES.html` in a second browser window, the same size as the console, before shot 0.
- Show every sped-up run with its real "Took …" time.
- If Devin isn't connected, stop.

---

## 📤 After Recording

- **Chapters:** Power Apps today, Opening, The console, Rules, Connectors, Apps, Deployment drift, Cost, Build or buy.
- **Description:** the one message, `docs/DEMO-SLIDES.pdf` attached, the repo, the five pull requests, and each run's time, ACUs and test total.
- **Replays:** copy each run's `apps/console/data/replays/<run_id>.json` to `runs/<run_id>/replay.json` and commit it.
- **Clean up:** stop running Devin sessions, delete stray `runs/` folders, reset the database. Tag the recorded commit, e.g. `loom-2026-09-28`.
