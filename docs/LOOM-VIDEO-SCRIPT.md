# Five-Minute Loom Video Script: Devin-Driven Internal Tools for a Regulated Fintech

## 🎯 Opening (45 seconds)
"I built a full-stack internal tools console with Devin, which I've called Solon, for a regulated fintech. It automates governed changes to the business rules that decide how the team handles its customers' data.

The brief: can Devin replace the client's current Power Apps setup for building their internal tools?"

**Tech Stack:**
- Frontend: Next.js and React with Tailwind CSS
- Backend: one engine on the server that every write goes through, over SQLite
- Integrations: the console drives Devin through the Devin API and follows pull requests through the GitHub API
- Why Devin? It edits across the codebase, runs the tests and opens the pull request. An engineer reviews and merges.

---

## 🧭 The Pitch: Two Paths (1 minute 20 seconds)

**▶ Slide 1 · Devin lets ops change their own rules, with every change reviewed**

"What follows is a pitch to the client on building versus buying their internal tools. We think a fintech's team runs two paths:"

1. **Data-shaped work** - queues, lookups and simple approvals, handled by ops on a low-code platform
2. **Money-moving or regulator-visible work** - robustly engineered

"The problem is that the boundary drifts. A simple queue grows into an approval flow, and before long a Power Automate flow is part of how refunds get decided. There's a third option: use Devin to build your internal tools platform."

**What the demo covers:**
- A new rule that spans two apps
- A manual workflow, automated
- A new app function: the console calling an outside service for the first time

**▶ Slide 2 · Leaving Power Apps means replacing five products, not one**

"Business ops use Power Apps while your engineers focus on product and platform. That's an opportunity cost, but the real cost to evaluate is whether maintaining all of this going forward is sustainable."

---

## 🏗 Quick Tour (40 seconds)

[Console Home, viewing as Manager]

"Devin built this. Three live apps - KYC review, Refunds and Feature flags - plus 17 coming soon across Compliance, Money Movement, Customers and Platform, to give a sense of where the platform could go."

"Every write goes through one engine. Because every future app is built on the same kernel, it inherits roles, rules and the audit log automatically."

"So Devin can build the apps. The real question is whether ops teams can still change them."

---

## 🧩 Add a Rule - Refund Hold (3 minutes)

### The Pattern
[Refunds page, pattern monitor open on Kestrel Outdoors]

"Four refunds, all 'parcel not received', all just under the $500 manager approval limit. That looks suspicious."

**Pattern Monitor:**
- A simple declared SQL query over the refunds table - no AI watching the queue
- The strip shows the query's result as a chip

### Ask Devin
[Take a look → Ask Devin for a rule → Tab → Send to Devin]

"Without leaving the page, the manager asks Devin for a rule:

**The Request:**
- If a merchant's 'not received' refunds add up to more than the manager limit, send them all to a manager - potential fraud
- Route those customers' KYC approvals to a manager too

Summing a merchant's refunds sounds like a one-liner, but it isn't: rejected refunds mustn't count, and goodwill refunds have their own approval limit."

### Devin at Work
**Console Modal:**
- Live steps from the Devin API, so you never have to leave the console
- Context goes to Devin as a JSON file, and a Devin playbook gives it the standard instructions
- Shows the files Devin read, the changes it made, and its lint and test results

### Review and Merge
[Open the pull request on GitHub]

"The pull request shows the decisions Devin made and the judgement calls it took. It knows the manager limit, and that the rule covers all four refunds. The engineer reviews and merges on GitHub, and the console picks up the merge through the GitHub API."

### Switch It On
[See it on Refunds → Rules panel]

"Refund hold now sits in the Rules panel with its pull request. Devin ships every rule switched off, and the monitor says so. Turn it on, and all four refunds move to the manager."

[Open a held refund]
"The relevant details are highlighted, and the manager decides: release the funds, or reject."

[Click Reject]

---

## ⏯ Switch Off & Remove (1 minute 20 seconds)

### Switch It Off
[Rules panel → toggle Refund hold off]
"If the rule turns out not to be fit for purpose, switch it off. The refunds go straight back to the analyst queue."

### Remove It
[Remove… → Remove rule]
"Realistically, you'd want it out of the codebase entirely. The window shows the original request and what happens when it's removed.

This isn't a git revert. Devin edits the code as it stands today, so anything merged since stays where it is."

[Skip ahead → open the pull request → merge → back to the console]
"Refund hold now shows as Recently removed."

---

## 🔎 Automate a Manual Check - Companies House (1 minute 50 seconds)

### Why This One
"So far Devin has only worked with data the console already holds. A lot of what Power Apps does reaches outside, through connectors and daily flows. So let's automate a check against Companies House."

### The Pattern
[KYC review → Take a look]
"The pattern monitor flags four UK merchants that were checked on Companies House by hand at onboarding, and never since."

### Ask Devin
[Ask Devin to monitor merchants → Tab → Send to Devin]
"Devin is sent the four merchants and what to look for on Companies House. Much of the process is the same as before, so let's skip to the pull request."

### Merge and Recheck
[Merge the pull request → See it on KYC → toggle Merchant monitoring on → Recheck now]
"Devin added a rule called Merchant monitoring: every approved UK merchant is rechecked on Companies House against its original KYC details."

**The Result:**
- Four merchants rechecked against the live register
- Three still active - nothing changes for them
- Wilko Limited - in liquidation

### Wilko
[Click Wilko Limited → Declared vs found]
"This is a real company. The Wilko brand still trades, but the company this system onboarded is now WL Realisations, in liquidation - and only Companies House shows that.

Devin also linked the KYC case to the Refunds app, so Wilko's refunds now need a manager. It's not just a rule change: Devin connected two apps."

---

## ⚖️ Build or Buy (1 minute)

**▶ Slide 3 · Build it yourselves, one app at a time, with one engineer in charge**

"Should you build with Devin, or keep paying the licence? Build one app first, and see how Devin picks up the tacit knowledge: the formulas and flows nobody writes down."

**Why Build:**
- Every later app comes off the same platform: the same engine, roles, rules and audit log

**Risks:**
- More individual ownership can mean an overwhelming number of business changes - a Jevons paradox
- We don't know the true economics yet

**▶ Slide 4 · A 90-day pilot on your own data will settle the decision**

"So we propose a 90-day pilot on your own data and logins, judged on how accurately and consistently it decides compared with Power Apps."

---

## 🎯 Future Improvements (35 seconds)

"One thing I didn't fully capitalise on was Devin working without being asked. Every change here started with a button.

1. **Scheduled Sweeps** - Devin's scheduled sessions could sweep every app once a week for rules that have sat switched off, and open a pull request to remove each one
2. **Built for the Next Ten Apps** - especially useful across the ten new apps you're planning, because what makes internal tools a time sink isn't building them, it's maintaining them

Thanks for watching - chat soon!"

---

## 📝 Demo Checklist

**Before recording:**
- [ ] Start a fresh take: `pnpm exec tsx scripts/demo-reset.ts`
- [ ] Start the console: `pnpm dev`, then open a new tab at http://localhost:3001 so the pattern monitor slides in
- [ ] Check `/api/devin/status` reads live, with the GitHub token and Companies House key set
- [ ] Browser at 1440×900, with the slides (`docs/DEMO-SLIDES.html`) and GitHub in separate windows
- [ ] View the console as Manager

**During recording:**
- [ ] Slides 1-2, then the Home tour
- [ ] Refunds: Take a look → Ask Devin for a rule → Tab → Send to Devin
- [ ] Open the pull request, merge it on GitHub, See it on Refunds
- [ ] Switch Refund hold on, open a held refund, reject it
- [ ] Switch it off, Remove… → Remove rule, merge, show Recently removed
- [ ] KYC: Take a look → Ask Devin to monitor merchants → Tab → Send to Devin
- [ ] Merge, See it on KYC, switch Merchant monitoring on, Recheck now once
- [ ] Click Wilko Limited, show Declared vs found, then its refunds
- [ ] Slides 3-4, future improvements, close

**After recording:**
- [ ] Link the GitHub repo in the description
- [ ] Add chapter timestamps in the comments
- [ ] Tag: #devin #internal-tools #fintech #power-apps
