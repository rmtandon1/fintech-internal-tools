# Complete Workflow: Dynamically Changing the Rules

How a business rule in the console is added, switched off and removed, from the point of view
of the people who use the console. The example throughout is the refund clustering hold from
Part 1 of the demo: four Kestrel Outdoors refunds that each pass on their own but together
cross the $500 manager line.

For the architecture behind this, see [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md). For
the exact code the change touches, see
[DEVIN-CLUSTERING-HOLD-SPEC.md](DEVIN-CLUSTERING-HOLD-SPEC.md).

---

## Your Questions Answered

### Q1: Where can I see a rule change I asked for?

On `/runs`. Every request appears there the moment you send it, with its sentence, who asked,
its status and its pull request. Click a row to open the Devin window with the run's progress.
The audit log (`/audit`) records the same run as it moves.

| What you did | What the console shows | What the system actually did |
|---|---|---|
| Clicked **Send to Devin** | `/runs` row: **Sent to Devin** | Wrote `runs/<run_id>/context.json`, a `devin_runs` row and a `dispatch` audit row, then opened a Devin session |
| Waited | **Devin working**, with a live checklist | Devin planned, edited and tested on its own branch. Your console and data are untouched |
| Devin finished | **Devin working**, pull request linked | A pull request is open on GitHub. CI is running. Nothing is live |
| An engineer approved | **Approved** | GitHub has an approving review, and Devin has been asked to merge |
| Devin merged | **Live** | The merge is on `cognition-dashboard-devin-integration`, pulled into the console's checkout, and migrated |
| Devin couldn't start | **Couldn't start** | Nothing reached Devin. The run and its audit rows record why |
| Someone pressed **Stop run**, or the session ended | **Stopped** | The session is ended. No branch reached the console |

### Q2: When does a rule change actually take effect?

Only after three things are true: an engineer who didn't ask for it has approved it, Devin has
merged it, and the console's checkout has pulled the merge. Until then the rule exists only on
Devin's branch, and every refund behaves exactly as before.

A **setting** change is different. Moving a threshold or switching a rule off on
`/admin/policy` takes effect on the very next decision, with no code change and no merge.

| Change | Takes effect | Needs an engineer? |
|---|---|---|
| Add or change a rule | After approval, merge and pull | Yes, to approve |
| Switch a rule off (`refunds.clustering_window_days` → 0) | The next decision | No |
| Move a threshold (`refunds.manager_approval_usd_minor`) | The next decision | No |
| Remove a rule | After approval, merge and pull | Yes, to approve |

### Q3: What is the difference between switching a rule off and removing it?

Switching off is a setting: the rule's code still runs, reads its off value and allows every
refund. Removing it is a code change: Devin takes the rule, its KYC check, its setting and its
tests out, keeping everything merged since. Switch off first when a rule misfires. Remove it
once you're sure it's not wanted.

---

## Complete Workflow (Step-by-Step)

### Scenario A: Add a rule

#### Step 1: Spot the pattern

```
Home → Refunds → cluster strip "Kestrel Outdoors · 4 refunds"
```

**What happens**

- The refunds queue shows a strip above the table for merchants whose `not_received` refunds
  each sit under the manager line but together reach it.
- Clicking it opens a drawer over the queue: the four refunds, their total and the rules that
  allowed each one.

```
┌─ Stacked under the manager line ───────────────────────────────┐
│ 4 refunds from Kestrel Outdoors add up to $1,880               │
│ Manager line $500 · last 14 days                               │
├────────────────────────────────────────────────────────────────┤
│ rfnd_0011   $480   not received   ✅ amount_approval  allow    │
│ rfnd_0012   $475   not received   ✅ amount_approval  allow    │
│ rfnd_0013   $460   not received   ✅ amount_approval  allow    │
│ rfnd_0014   $465   not received   ✅ amount_approval  allow    │
├────────────────────────────────────────────────────────────────┤
│ No rule covers this pattern.          [ Ask Devin for a rule ] │
└────────────────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Pattern visible to every refunds role
- ❌ No rule holds these refunds
- ⚠ An `analyst` sees the drawer but not the button; only a manager or admin can ask

#### Step 2: Ask Devin in one sentence

```
Refunds → cluster drawer → Ask Devin for a rule → Send to Devin
```

**What happens**

- The Devin window opens with the request box empty, offering the spec's sentence as a grey suggestion Tab accepts; the requester may type their own:
  *"Once a merchant's "not received" refunds add up past the manager limit, send them to a
  manager for approval. Send those customers' KYC approvals to a manager too."*
- Below it, the context Devin will receive: the four amounts, the live $500 and score-70 lines,
  and the base commit. No email, no card number.
- **Send to Devin** runs the same governed write as every other action: role check, one run per
  tool, then an audit row.

```
┌─ Devin · New rule ─────────────────────────────────┐
│ REQUEST                                            │
│ Once a merchant's "not received" refunds add up    │
│ past the manager limit, send them to a manager…    │
│                                                    │
│ CONTEXT                                            │
│ Kestrel Outdoors · 4 refunds · $1,880              │
│ Manager limit $500 · Manager threshold 70 · no PII │
│                                                    │
│ GUARDRAILS                                         │
│ tools/refunds · tools/kyc · tests                  │
│ Checks: Lint · Typecheck · Boundaries · Test       │
│                                  [ Send to Devin ] │
└────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Request recorded (`/runs`: **Sent to Devin**)
- ✅ `dispatch` audit row written
- ❌ No code changed yet

#### Step 3: Watch Devin work

```
/runs → click the run  (or the Devin button in the header, or press ])
```

**What happens**

- The checklist advances only when Devin reports progress: never on a timer.
- Devin commits its plan (the files it will touch) before it edits anything. CI later fails
  any file outside that plan.

```
┌─ Devin · New rule · Verifying ─────────────────────┐
│ ✅ Intake              base a54fd58                │
│ ✅ Baseline            325 tests                   │
│ ✅ Plan committed      5 files                     │
│ ✅ Edit                +146 −3                     │
│ ●  Verify   Lint ✅ Typecheck ✅ Boundaries ✅ Test… │
│ ○  Pull request                                    │
│                                                    │
│ [ Stop run ]                     [ Open in Devin ] │
└────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Work visible as it happens
- ❌ Nothing live: refunds still go straight to the processor
- ⚠ If Devin asks a question, a reply box appears. The run waits for you

#### Step 4: An engineer approves

```
Viewing as → engineer → /runs → the run → Review and approve → Approve as engineer
```

**What happens**

- The approval dialog shows the files, the four CI checks and the reviewer's checklist.
- **Context untouched** confirms the request on Devin's branch is byte-for-byte what the console
  sent.
- Approving posts a GitHub review as the engineer, then asks Devin to merge.

```
┌─ Approve pull request ─────────────────────────────┐
│ 5 files · +146 −3                                  │
│ CI checks  4 of 4 passed ✅                        │
│ Context    unchanged ✅                            │
│ Checklist  9 of 9 ticked ✅                        │
│                  [ Cancel ]  [ Approve as engineer ]│
├────────────────────────────────────────────────────┤
│ ✅ 🔗 Approving review submitted · engineer         │
│ ●     Devin merging                                │
│ ○     Pulled into the console                      │
└────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Approved by someone who didn't request it
- ⚠ The person who asked can't approve their own run; the button doesn't show for them
- ❌ Not live until the merge is pulled

#### Step 5: The rule goes live

```
Approval dialog → Devin merged → Pulled into the console → Close
```

**What happens**

- The console records the merge, pulls it with `git pull --ff-only`, runs any pending migration
  and registers the new window setting.
- The run turns **Live** on `/runs`.

**Current state**

- ✅ Merge recorded (`record_merge` audit row)
- ✅ New setting `refunds.clustering_window_days` = 14 on `/admin/policy`
- ⚠ If the pull was skipped, the run offers **Pull merged code**

#### Step 6: The same click, a different result

```
Viewing as → analyst → Refunds → rfnd_0013 → Send to processor
```

**What happens**

```
┌── Before ──────────────────────────┐    ┌── After ───────────────────────────┐
│ With processor                     │    │ Waiting for manager                │
│ ✅ within_captured_amount  allow   │    │ ✅ within_captured_amount  allow   │
│ ✅ not_disputed            allow   │    │ ✅ not_disputed            allow   │
│ ✅ amount_approval         allow   │    │ ✅ amount_approval         allow   │
│ ✅ goodwill_approval       allow   │    │ ✅ goodwill_approval       allow   │
│                                    │    │ ⚠ clustering_hold          hold    │
│                                    │    │   Kestrel $1,880 over 14 days      │
└────────────────────────────────────┘    └────────────────────────────────────┘
```

Open `kyc_0013` as `analyst`: **Approve** now routes to a manager, and the trace
names `linked_refund_hold`.

**Current state**

- ✅ Rule live on refunds and KYC
- ✅ The Manager pays or rejects each routed refund directly; the action is audited

### Scenario B: Switch the rule off

#### Step 1: Change one setting

```
Viewing as → admin → Admin → Rule settings → refunds.clustering_window_days → 0 → Save
```

**What happens**

- The setting changes in the live database, and a `constant_changed` audit row records who
  did it.
- The next Kestrel refund goes straight to the processor. The trace still lists `clustering_hold`, reading allow.

```
┌─ Rule settings ─────────────────────────────────────────┐
│ refunds.clustering_window_days                          │
│ Days of not-received refunds summed per merchant;       │
│ 0 turns the hold off                                    │
│ [ 0      ]                    was 14      [ Save ]      │
│ ⚠ Applies from the next decision                        │
└─────────────────────────────────────────────────────────┘
```

**Current state**

- ✅ Refunds flow again, in seconds
- ✅ No engineer, no deploy
- ⚠ The rule is still in the code. Setting 14 turns it back on

### Scenario C: Remove the rule

#### Step 1: Ask for the undo

```
Viewing as → admin → /runs → the merged rule → Undo this change → Ask Devin to undo it
```

**What happens**

- The request is fixed ("Undo the refund hold …") and names the merged run.
- Devin starts from a revert, resolves conflicts so later work survives (for example a
  `partial_delivery` reason code added since), and removes the rule, its KYC check, its
  setting and its tests.
- The pull request lists what code can't undo: refunds still in the Manager queue, and the setting row left in
  the database.

#### Step 2: Approve and merge

```
Viewing as → engineer → the undo run → Review and approve → Approve as engineer
```

**Current state**

- ✅ Rule gone from the code and the policy trace
- ✅ Later changes kept
- ⚠ Routed refunds need a Manager to pay or reject them
- ⚠ The `refunds.clustering_window_days` row stays on `/admin/policy` until someone removes it

---

## Key Insights

The console shows two different kinds of state, and they move at different speeds.

| What you see | What it means |
|---|---|
| **Sent to Devin** | The request is recorded. Nothing has changed |
| **Devin working** | Code is changing on a branch nobody runs |
| **Approved** | A person signed off. The code is still not live |
| **Live** | The merge is in the console's code and applies to the next decision |
| **Stopped** / **Couldn't start** | The run ended. Nothing it did reached the console |
| A value on **Rule settings** | What every decision reads right now |

**A rule changes behaviour when its code is merged and pulled. A setting changes behaviour the
moment it is saved.**

- Before the merge is pulled: every refund follows the old rules, whatever the run says.
- After the merge is pulled: the next matching refund follows the new rule, with no restart.
- Before a setting is saved: nothing changes.
- After a setting is saved: the very next decision reads the new value.

---

## Visual Timeline

```
 T0                 ┌───────────────────────────────┐   devin_runs: (none)
 Before             │ Kestrel refund → With         │   runtime_constants: no window row
                    │ processor. 4 rules, all allow │   git HEAD: a54fd58
                    └───────────────┬───────────────┘
                                    ↓  Manager: Ask Devin for a rule → Send to Devin
 T0 + 1 min         ┌───────────────────────────────┐   devin_runs.status = dispatched → running
 Requested          │ /runs: Sent to Devin          │   runs/<id>/context.json written
                    │ Refunds unchanged             │   audit: dispatch, record_session
                    └───────────────┬───────────────┘
                                    ↓  Devin plans, edits, tests, opens a PR
 T0 + run           ┌───────────────────────────────┐   devin_runs.pr_url = …/pull/<n>
 In review          │ /runs: Devin working, PR #n   │   branch devin/<id>-clustering-hold
                    │ Refunds unchanged             │   audit: record_pr
                    └───────────────┬───────────────┘
                                    ↓  engineer: Review and approve → Approve as engineer
 T0 + run + review  ┌───────────────────────────────┐   devin_runs.status = approved → merged
 Live               │ /runs: Live                   │   git HEAD: <merge commit>
                    │ Manager queue; direct action │   runtime_constants: window = 14
                    │ (clustering_hold)             │   audit: approve_pr, record_merge
                    └───────────────┬───────────────┘
                                    ↓  admin: Rule settings → window 0 → Save
 Later              ┌───────────────────────────────┐   runtime_constants: window = 0
 Off                │ Kestrel refund → processor    │   code unchanged
                    │ clustering_hold reads allow   │   audit: constant_changed
                    └───────────────┬───────────────┘
                                    ↓  admin: Undo this change → engineer approves
 Later still        ┌───────────────────────────────┐   git HEAD: <undo merge commit>
 Removed            │ Kestrel refund → processor    │   runtime_constants: window row left
                    │ Trace: 4 rules, all allow     │   audit: dispatch … record_merge
                    └───────────────────────────────┘
```

---

## Important Notes

### 1. Where state is stored

Settings live in the `runtime_constants` table of `apps/console/data/console.db`, and every
decision reads them fresh:

```ts
// packages/engine/src/policy/constants.ts
export function loadConstants(): ConstantReader {
  const rows = db.select().from(runtimeConstants).all();
  const map = new Map(rows.map((r) => [r.key, JSON.parse(r.valueJson) as unknown]));
  ...
}
```

A run's status lives in `devin_runs`, and only audited actions change it:

```ts
// tools/automation/src/schema.ts
/**
 * Devin runs the console has asked for. A row moves only through audited
 * intents (dispatch, record_session, approve_pr, record_merge, stop); polled
 * session progress is held in memory and never written here.
 */
export const devinRuns = sqliteTable("devin_runs", { ... });
```

What Devin was given is frozen in git, in `runs/<run_id>/context.json` and `plan.json`. Nothing
about runs or rules is kept in the browser: there is no `localStorage` state.

### 2. Why it's built this way

- ✅ A rule that decides whether money moves always gets a second person's review.
- ✅ Switching off never waits for an engineer.
- ✅ No feature flag is left behind in the code for someone to clean up.
- ✅ One audit log shows the request, approval, merge, switch-off and removal.
- ✅ Devin never touches live data: it works from a snapshot with no customer details.

### 3. Current limitations, and how to check by hand

- ⚠ A production build (`pnpm start`) serves compiled code. After a merge, run `pnpm build`
  and restart it. `pnpm dev` picks the change up by itself.
- ⚠ The pull is skipped when the console's checkout isn't on
  `cognition-dashboard-devin-integration` or has uncommitted changes. The run then offers
  **Pull merged code**.
- ⚠ Merges are noticed while someone has the run or `/runs` open. **Sync with GitHub** on
  `/runs` catches up on anything missed.
- ⚠ Branch protection is not switched on for the integration branch today, so GitHub itself
  doesn't enforce the review. The console's approval does.

Check by hand:

```bash
sqlite3 apps/console/data/console.db \
  "select id, status, pr_url, merge_commit from devin_runs order by requested_at desc limit 5;"
sqlite3 apps/console/data/console.db \
  "select key, value_json, updated_by from runtime_constants where key like 'refunds.%';"
git log --oneline -3 origin/cognition-dashboard-devin-integration
```

### 4. Optional future enhancements

- 🔗 Notify the requester in Slack when their rule goes live.
- 🔗 Remove a rule's leftover setting row automatically once its undo merges.
- 🔗 Turn on branch protection so GitHub enforces the same review the console does.

---

## Summary

- ✅ **Where can I see it?** `/runs`, with the full history in `/audit`.
- ✅ **When does it take effect?** A rule: once approved, merged and pulled. A setting: the next
  decision.
- ✅ **Off or removed?** Off is one setting, in seconds, code unchanged. Removed is a reviewed
  pull request that keeps everything merged since.

---

## Dependencies

```bash
pnpm install
pnpm db:setup
cp -n .env.example .env    # set DEVIN_API_KEY and GITHUB_TOKEN
pnpm devin:playbook     # register the run playbook with Devin, once per organisation
pnpm dev
```

Full setup: [SETUP.md](SETUP.md), [DEVIN_SETUP_GUIDE.md](DEVIN_SETUP_GUIDE.md),
[GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md).

---

## Next Steps

1. As `analyst`, send `rfnd_0013` to the processor. It goes straight through (**With processor**). That is the before.
2. Reset: `rm -rf apps/console/data && pnpm db:setup`.
3. As `manager`, open the Kestrel cluster and press **Ask Devin for a rule**, then
   **Send to Devin**.
4. Watch `/runs` move from **Sent to Devin** to **Devin working** with a pull request.
5. Switch to `engineer`, open the run, **Review and approve**, then **Approve as engineer**.
6. Confirm the run reads **Live** and `git log -1` shows the merge.
7. As `analyst`, find `rfnd_0011` absent from the refunds queue. As `manager`, open it from the
   manager queue and pay or reject it directly; the trace names `clustering_hold`.
8. As `admin`, set `refunds.clustering_window_days` to 0. Send `rfnd_0014`. It goes straight through.
9. As `admin`, press **Undo this change** on the run, and approve the undo as `engineer`.
10. Check `/audit` shows every step, from the request to the removal.

Want the requester told automatically when their rule goes live? A Slack message on
`record_merge` is the natural next change.
