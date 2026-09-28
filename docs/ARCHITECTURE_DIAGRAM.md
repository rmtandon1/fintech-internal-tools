# Architecture: How changes and undos work

A person describes a rule in one sentence. Devin writes it as code, an engineer approves it, and
the console runs it. When the rule is no longer wanted, an admin switches it off in seconds and
Devin takes it back out of the code.

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Refunds split   │ │ A rule that     │ │ A rule no       │ │ A check done    │ │ An app still in │
│ under a limit   │ │ misfires        │ │ longer needed   │ │ by hand         │ │ Power Apps      │
│                 │ │                 │ │                 │ │                 │ │                 │
│ /t/refunds      │ │ /admin/policy   │ │ /runs           │ │ /t/kyc/<id>     │ │ /roadmap/<app>  │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         ▼                   ▼                   ▼                   ▼                   ▼
┌──────────────────┬───────────────────┬───────────────────┬───────────────────┬──────────────────┐
│       ADD        │    SWITCH OFF     │      REMOVE       │     AUTOMATE      │      MIGRATE     │
└────────┬─────────┴─────────┬─────────┴─────────┬─────────┴─────────┬─────────┴─────────┬────────┘
         └───────────────────┴───────────────────┼───────────────────┴───────────────────┘
                                                 ▼
                      ┌─────────────────────────────────────────────────────┐
                      │                    Governed write                   │
                      │     Role check, policy check and audit log entry    │
                      └─────────┬─────────────────────────────────┬─────────┘
                    SWITCH OFF  │                                 │ ADD, REMOVE,
                                │                                 │ AUTOMATE, MIGRATE
                                ▼                                 ▼
                  ┌───────────────────────────┐ ┌───────────────────────────────────┐
                  │ Policy setting changed    │ │ 1  Context captured, no PII       │
                  │                           │ │ 2  Devin session opened           │
                  │ Applies from the next     │ │ 3  Plan committed first           │
                  │ decision. No code         │ │ 4  Code and tests written         │
                  │ change, no deploy.        │ │ 5  CI checks pass                 │
                  │                           │ │ 6  Engineer approves              │
                  │                           │ │ 7  Merge, sync; rebuild in prod   │
                  └─────────────┬─────────────┘ └─────────────────┬─────────────────┘
                                └────────────────┬────────────────┘
                                                 ▼
                      ┌─────────────────────────────────────────────────────┐
                      │          New behaviour live in the console,         │
                      │              recorded in one audit log              │
                      └─────────────────────────────────────────────────────┘
```

Five starting points come down to three operations. Add, automate and migrate are each a
**change**: a Devin run that writes code. Remove is an **undo**: a Devin run that takes one
earlier change back out. Switch off is a **setting**: no run and no code.

| Operation | Starts from | Example | Runs as | Approval |
|---|---|---|---|---|
| **Add** a rule | **Ask Devin for a rule** in the refunds cluster drawer | Hold a merchant's refunds once together they pass the manager limit | Change | Engineer |
| **Switch off** a rule | The rule's setting on `/admin/policy` | Set `refunds.clustering_window_days` to 0 during a courier outage | Setting | Admin only |
| **Remove** a rule | **Undo this change** on a merged run in `/runs` | Take the refund hold out of the code, keeping later work | Undo | Engineer |
| **Automate** a check | **Ask Devin to add a check** on a KYC case | Look up UK businesses on Companies House from the case | Change | Engineer |
| **Migrate** an app | **Ask Devin to start this app** on its Coming soon page | Move Chargebacks from Power Apps into the console | Change | Engineer and engine owner |

## The three-layer system

```
      Operations staff  ·  Managers  ·  Admins  ·  Engineers
                            │
                            ▼
┌───────────────────────────────────────────────────┐          ┌─────────────────────────┐
│ 1  CONSOLE                                        │  start   │ DEVIN                   │
│    Queues · Records · Approvals · Policy · Runs   ├─────────▶│ Plans, edits and tests  │
│    Next.js application                            │  a run   │ on its own branch       │
└───────────────────────────────────────────────────┘          └────────────┬────────────┘
                            ↕  server action, instant                       │ pull request
                               request down; result and policy trace up     ▼
┌───────────────────────────────────────────────────┐          ┌─────────────────────────┐
│ 2  ENGINE                                         │          │ GITHUB                  │
│    Governed write: role, policy, approval, audit  │          │ CI and guard checks,    │
│    Rules as loaded at the last start or sync      │          │ engineer approval       │
│    Live settings, records and audit log (SQLite)  │          └────────────┬────────────┘
└───────────────────────────────────────────────────┘                       │ merge
                            ↑  merge sync, after each merge                 │
                               git pull, db:migrate, new settings           │
                               registered; rebuild in production            │
┌───────────────────────────────────────────────────┐                       │
│ 3  SOURCE CODE                                    │                       │
│    Tool rules · Registry · Tests · Run records    │◀──────────────────────┘
│    Git repository                                 │
└───────────────────────────────────────────────────┘
```

| Layer | Responsibility | Changes when | Location |
|---|---|---|---|
| **1 Console** | Queues, record views, the approval inbox, policy settings, runs and the Devin window | A person acts, instantly | `apps/console` |
| **2 Engine** | The only path that writes data. Checks roles and policy, holds approvals, masks personal data, keeps the audit log, and holds live settings | A server action commits; a merge sync loads new code | `packages/engine`, `packages/db-*` |
| **3 Source code** | Each tool's rules, actions, settings and tests, plus a record of every run | A reviewed pull request merges | `tools/*`, `apps/console/src/registry.ts`, `runs/` |

Five rules keep the layers separate:

- **The console never edits code or data itself.** Data changes go through the engine. Code
  changes go through a Devin run. The merge sync only pulls code that has already merged.
- **Code reaches the repository only through a reviewed merge.** Devin writes on its own branch,
  never to the live database, and merges only after an engineer who did not ask for the change
  approves it.
- **The engine reflects code only after a merge sync.** A merged rule does nothing until the
  console pulls it, migrates its database and registers the rule's settings. A production build
  must then be rebuilt to serve the new code.
- **Settings live in the engine, not the code.** Switching a rule off changes layer 2 only, so it
  applies from the next decision with no run and no deploy.
- **The engine names no tool.** The engine runs whatever rules a tool declares. A new app is a
  new folder under `tools/` and one line in the registry. `pnpm check:boundaries` fails the
  build if a tool name appears in the engine.

## How each operation moves through the layers

The three layers change at different moments. A request changes the console and the engine's
records at once, but not the rules. A merge changes the code, but not what the engine runs. Only
the merge sync brings them back into line. Until then, the engine keeps running the code it
already has, so nothing half-finished is ever live.

The example throughout is a rule that holds a merchant's refunds once together they pass the $500
manager limit.

### Change: add a rule

```
 BEFORE
   Console   Kestrel cluster in the refunds drawer: 4 refunds, $1,880 in 14 days
   Engine    No clustering rule. The next Kestrel refund settles
   Code      No clustering rule

 AFTER THE REQUEST                                                          instant
   Console   Run view opens and shows progress
   Engine    Run row and dispatch audit entry written
             Rules unchanged. The next Kestrel refund settles       ← NO CHANGE YET
   Code      Integration branch unchanged                           ← NO CHANGE YET
             Devin plans, edits and tests on its own branch

 AFTER DEVIN, REVIEW AND MERGE
   Console   Run shows merged
   Engine    approve_pr and record_merge audit entries written
             Still the old rules. The next Kestrel refund settles   ← NO CHANGE YET
   Code      clustering_hold on refunds, linked_refund_hold on KYC,
             eight tests and runs/<run_id>/ merged

 AFTER MERGE SYNC
   Console   Policy trace lists clustering_hold
   Engine    Code pulled, database migrated, window setting registered at 14 days
             The next Kestrel refund is held for a manager
   Code      Unchanged since the merge                              ✓ IN LINE
```

### Setting: switch a rule off

```
 BEFORE
   Console   /admin/policy: clustering window 14 days
   Engine    The next Kestrel refund is held for a manager
   Code      clustering_hold present

 AFTER THE ADMIN SETS THE WINDOW TO 0                                       instant
   Console   /admin/policy: clustering window 0 days
   Engine    Setting updated; set_constant audit entry keeps before and after
             clustering_hold still runs, reads 0 and allows
             The next Kestrel refund settles
   Code      clustering_hold present                                ← NEVER CHANGES
                                                                    ✓ IN LINE
```

Restoring the setting turns the rule back on, just as fast.

### Undo: remove a rule

```
 BEFORE                                                      rule live or switched off
   Console   Merged run in /runs offers Undo this change
   Engine    clustering_hold runs on every refund
   Code      clustering_hold present

 AFTER THE UNDO REQUEST                                                     instant
   Console   Undo run view opens and shows progress
   Engine    Run row and dispatch audit entry written
             clustering_hold still runs                             ← NO CHANGE YET
   Code      Integration branch unchanged                           ← NO CHANGE YET

 AFTER DEVIN, REVIEW AND MERGE
   Console   Undo run shows merged; the PR lists manual follow-ups
   Engine    clustering_hold still runs                             ← NO CHANGE YET
   Code      Rule, KYC check and tests removed
             Later changes to the same files kept

 AFTER MERGE SYNC
   Console   Policy trace no longer lists clustering_hold
   Engine    The next Kestrel refund settles
             Window setting row and any held refunds remain         → MANUAL FOLLOW-UP
   Code      Unchanged since the merge                              ✓ IN LINE
```

An undo takes a run, a review and a merge. Switching the rule off first covers that gap: the rule
keeps running but allows everything until the sync removes it.

### Rule lifecycle

A live rule and a switched-off rule run the same code. Only an undo takes the rule out of the
code.

```
 ┌────────┐           ┌───────────┐                  ┌────────┐                  ┌────────┐
 │ Absent │──────────▶│ In review │─────────────────▶│  Live  │─────────────────▶│  Off   │
 │        │  request  │           │  approve, merge  │        │◀─────────────────│        │
 └────────┘           └───────────┘                  └───┬────┘  switch off, on  └─────┬──┘
      ▲                                                  │ undo                   undo │
      │               ┌─────────────┐                    ▼                             │
      └───────────────┤ Undo review │◀───────────────────┴─────────────────────────────┘
       approve, merge └─────────────┘
```

## Roles and responsibilities

| Party | Responsible for | Cannot |
|---|---|---|
| **Console** | Showing each queue and its evidence, and sending requests to the engine and to Devin | Write data except through the engine, or change code except through a Devin run |
| **Engine** | Deciding every write, running the rules it has loaded, and recording each write in the audit log | Call Devin or GitHub, or pick up new code before a merge sync |
| **Devin** | Planning, writing and testing each change or undo on its own branch, opening the pull request, and merging once approved | Read the live database, merge files outside its plan, or merge without approval |
| **GitHub** | Running CI and the guard checks on every pull request, and enforcing branch protection | Let Devin bypass review |
| **Engineer** | Reviewing each pull request against its plan and acceptance checklist, and pulling merged code if the automatic sync did not run | Approve a change they requested |
| **Managers and admins** | Requesting changes (managers for their own area, admins for any), requesting undos and switching rules off (admins only), and approving operational decisions | Approve their own requests |

## Reversibility

Nothing is copied aside before a change. Git already holds every version of the code, the run
record holds what the console asked for, and the audit log holds every setting's previous value.
Each operation keeps what its reverse needs.

**A change** records its starting point before Devin edits anything:

```bash
# 1  Capture: dispatch writes what Devin works from, with no customer data
runs/<run_id>/context.json        # request, live settings, evidence, allowed paths
sha256(context.json)              # stored in the dispatch audit entry

# 2  Freeze: Devin's first commit on its branch is the record, before any edit
git add runs/<run_id>/context.json runs/<run_id>/plan.json
git commit                        # "Run dir frozen" fails if either file changes later

# 3  Change: only the files listed in plan.json ("Stays in plan")
# 4  Merge: CI passes, an engineer approves, Devin merges
record_merge merge_commit=<sha>   # audit entry; runs/<run_id>/ merges with the code
```

**An undo** starts from that merge and works forward from the code as it is now:

```bash
git revert -m 1 <merge_commit>    # starting point, on a fresh branch
# resolve conflicts: the undone change goes, every later change stays
# settings the change added: removed from the code
# settings the change altered: back to the value in context.json,
#   unless an admin has set one since; the PR then reports both
# later tests that relied on the rule: rewritten and named in the PR
# what code cannot undo (held refunds, setting rows): listed as manual follow-ups
```

**A setting** keeps its previous value in the audit log:

```bash
set_constant refunds.clustering_window_days 0     # audit entry: before 14, after 0
set_constant refunds.clustering_window_days 14    # restore from the recorded "before"
```

| From | To | How |
|---|---|---|
| Off | Live | Restore the setting on `/admin/policy`. Takes effect from the next decision |
| Removed | Live | Request the rule again. The original request and plan remain in `runs/<run_id>/` |

## Timeline

Every operation answers at once in the console. The code and the engine catch up later, in that
order. Each marked point writes an audit entry.

```
 CHANGE
          T0             T1             T2             T3             T4             T5
          ●──────────────●──────────────●──────────────●──────────────●──────────────●────────────▶
          Requested      Devin working  PR open        Approved       Merged         Synced
          dispatch       record_session record_pr      approve_pr     record_merge

 Console  ■ run view shows progress ──────────────────────────────────────────────────────────────▶
 Code     ─ unchanged ────────────────────────────────────────────────■ rule merged ──────────────▶
 Engine   ─ old rules ───────────────────────────────────────────────────────────────■ rule live ─▶

 SWITCH OFF, THEN UNDO
          T0             T1             T2             T3             T4             T5
          ●──────────────●──────────────●──────────────●──────────────●──────────────●────────────▶
          Switched off   Undo asked     PR open        Approved       Merged         Synced
          set_constant   dispatch       record_pr      approve_pr     record_merge

 Console  ■ window 0 ────■ undo run shows progress ───────────────────────────────────────────────▶
 Code     ─ rule present ─────────────────────────────────────────────■ rule removed ─────────────▶
 Engine   ■ rule runs, allows ───────────────────────────────────────────────────────■ rule gone ─▶
```

The undo also writes `record_session` when Devin picks it up, so every run has five audit
entries on the normal path. Once a change is live, each refund the rule holds writes its own
entry.

## Why this works

- **Instant feedback.** Every request, decision and setting answers in one server action. A
  person never waits on Devin to see that their request landed.
- **Durable change through git.** A rule is code with tests, merged to the repository. No flag
  is left behind waiting for clean-up.
- **A human gate on every change.** An engineer who did not ask for the change approves it, after
  CI and the guard checks hold the diff to the plan Devin committed first.
- **Reversible at two speeds.** A setting switches a rule off in seconds. An undo takes it out of
  the code while keeping everything merged since.
- **One audit trail.** A hash-chained log records every request, approval, merge and setting,
  with the before and after of each setting change.
- **No half-states.** The engine runs either the old code or the new code, never a mix, and
  `runs/` records what the world looked like when each change was asked for.

## The governed write

Every write, whether a refund, a KYC decision, a flag change or a Devin request, runs the same
six steps. Steps two to six share one database transaction, so an error at any point rolls back
the whole request.

```
 Request ──▶ Validate ──▶ Idempotency ──▶ Policy ──▶ Approval ──▶ Effect ──▶ Audit
                 │             │             │           │
                 ▼             ▼             ▼           ▼
             Rejected      Replayed       Denied     Held for
            no write      or refused      audited   an approver
                          └──────────────────────────────────────────────────────┘
                                        one database transaction
```

Every app inherits seven controls from this path: role access, a policy check on every action,
approvals, live settings, idempotency, masked personal data and the audit log. The approval
query excludes the requester, so nobody can approve their own request.

## Workflows

Who does each step of a run. Switching a rule off needs no workflow: an admin changes one
setting, as shown above.

### Add a rule

The same flow applies to automating a check and migrating an app.

```
 REQUESTER        CONSOLE                   DEVIN                 GITHUB            ENGINEER
 ─────────        ───────                   ─────                 ──────            ────────
 Describes the ─▶ Records the request
 rule in one      Captures context
 sentence         Opens a session ────────▶ Reads the code
                                            Commits a plan
                                            Writes code and tests
                                            Opens a PR ─────────▶ Runs CI checks
                  Records the PR ◀───────── Reports the PR
                                                                                    Reviews the PR
                  Checks CI and ◀────────────────────────────────────────────────── Approves
                  context, then ────────────────────────────────▶ Review posted
                  asks Devin to merge ────▶ Merges ─────────────▶ Merged
                  Pulls, migrates and
                  loads new settings
 Next request  ◀─ New rule applies
 follows the rule
```

### Remove a rule

Removing a rule is not a plain `git revert`. Other changes may have touched the same files since
the rule merged. Devin removes the rule and keeps everything merged after it.

```
 ADMIN             CONSOLE                  DEVIN                             ENGINEER
 ─────             ───────                  ─────                             ────────
 Requests an ────▶ Records the request
 undo              Opens a session ───────▶ Reverts the original merge
                                            Resolves conflicts, keeping
                                            later changes
                                            Removes the rule, its setting
                                            and its tests
                                            Lists manual follow-ups
                                            Opens a pull request ───────────▶ Reviews and
                                                                              approves
                   Records the merge ◀───── Merges
                   Rule no longer runs
```

The pull request lists what code cannot undo, such as requests the rule is still holding. A
person clears these after the merge.

## Automation

Each Devin run moves through fixed phases. Every phase must pass for the run to continue.
States marked ■ are written to the audit log. States marked ○ are read from Devin as the run
progresses.

```
 Request
     │
     ▼
 Dispatch rules ── fail ──▶ Refused. Nothing is written.
     │ pass
     ▼
 ■ Dispatched ──▶ ■ Session started ── no session ──▶ ■ Dispatch failed
                       │
   ┌───────────────────┘
   ▼
 ○ Intake ──▶ ○ Baseline ──▶ ○ Plan ──▶ ○ Edit ──▶ ○ Verify ──▶ ○ Pull request
   │            │              │          │          │            │
   └────────────┴───────────┬──┴──────────┴──────────┘            ▼
                            │ failure or stop                   ■ PR open
                            ▼                                     │
                          ■ Stopped                               ▼
                                                                ■ Approved
                                                                  │
                                                                  ▼
                                                                ■ Merged
```

| Phase | Passes when |
|---|---|
| Intake | The request is valid and starts from the current code |
| Baseline | All checks pass before any change |
| Plan | Devin commits its list of files to change before editing any of them |
| Edit | Only planned files change |
| Verify | Lint, type checks, boundary checks and all tests pass, with no fewer tests than before |
| Pull request | A pull request is open for review |
| Merge | An engineer who did not request the change has approved it |

Five checks hold each change to its plan. Four run in CI on every pull request. The console
runs **Context untouched** when the engineer approves, because CI cannot read its database.

| Check | Fails when |
|---|---|
| Stays in plan | A file outside the plan changes |
| Plan stays in scope | The plan includes a file the request does not allow |
| Run dir frozen | The committed request or plan changes after the first commit |
| Shared code reported | Never. It names any shared code the change touches, such as the engine or the database schema, so their owners join the review |
| Context untouched | The request on the branch differs from the one the console sent |

Each run writes five audit entries: requested, session started, pull request opened, approved
and merged.

## Interface states

### From request to live rule

Four screens take a request to a live rule. Each arrow shows the action that moves to the next
screen, and which layers it passes between.

```
┌─ Request ──────────────┐                  ┌─ Run progress ─────────┐
│ "Once a merchant's…"   │  Start run       │ ✓ Plan    ✓ Edit       │
│ Context · Scope        │ ───────────────▶ │ ● Verify               │
│        [ Start run ]   │  Console → Devin │ ○ Pull request         │
└────────────────────────┘                  └────────────┬───────────┘
                                                         │ Pull request opened
                                                         │ Devin → GitHub
                                                         ▼
┌─ Refund ───────────────┐                  ┌─ Approve pull request ─┐
│ Pending manager        │  Merged, synced  │ CI checks   4 of 4 ✓   │
│ approval               │ ◀─────────────── │ Checklist   8 of 8 ✓   │
│ clustering_hold   hold │  Code → Engine   │         [ Approve ]    │
└────────────────────────┘                  └────────────────────────┘
```

### Requesting a change

The request panel shows exactly what Devin receives. Once the run starts, the same panel shows
its progress.

```
┌───────────────────────────────────────┐    ┌───────────────────────────────────────┐
│ Devin · New rule                      │    │ Devin · New rule · Verifying          │
├───────────────────────────────────────┤    ├───────────────────────────────────────┤
│ REQUEST                               │    │ ✓ Intake             base 1a67f60     │
│ Once a merchant's "not received"      │    │ ✓ Baseline           288 tests        │
│ refunds add up past the manager       │    │ ✓ Plan committed     5 files          │
│ limit, send them to a manager.        │ ──▶│ ✓ Edit               +146 −3          │
│                                       │    │ ● Verify                              │
│ CONTEXT                               │    │     Lint ✓  Typecheck ✓               │
│ Kestrel Outdoors · 4 refunds          │    │     Boundaries ✓  Test …              │
│ Manager limit $500 · no PII           │    │ ○ Pull request                        │
│                                       │    │                                       │
│ SCOPE                                 │    │ PLAN                                  │
│ tools/refunds · tools/kyc · tests     │    │ create  refunds/clustering-hold.ts    │
│                                       │    │ modify  refunds/index.ts, kyc/index.ts│
│                        [ Start run ]  │    │                                       │
└───────────────────────────────────────┘    └───────────────────────────────────────┘
```

### Approving a change

Only an engineer who did not request the change can approve it.

```
┌───────────────────────────────────────┐    ┌───────────────────────────────────────┐
│ Approve pull request                  │    │ Approve pull request                  │
├───────────────────────────────────────┤    ├───────────────────────────────────────┤
│ 5 files · +146 −3                     │    │ ✓  Review posted to GitHub            │
│ CI checks  4 of 4 passed ✓            │    │ ✓  Devin merged the PR                │
│ Context    unchanged ✓                │ ──▶│ ✓  Merged code pulled                 │
│ Checklist  8 of 8 ticked ✓            │    │ ✓  Audit entry written                │
│                                       │    │                                       │
│            [ Cancel ]  [ Approve ]    │    │                         [ Close ]     │
└───────────────────────────────────────┘    └───────────────────────────────────────┘
```

### The same action, before and after

A refunds agent sends the same kind of refund to the processor. After the rule merges, the
policy trace shows the new rule and the refund waits for a manager.

```
┌── Before ─────────────────────────────┐    ┌── After ──────────────────────────────┐
│ Refund · Send to processor            │    │ Refund · Send to processor            │
├───────────────────────────────────────┤    ├───────────────────────────────────────┤
│ Settled                               │    │ Pending manager approval              │
│                                       │    │                                       │
│ within_captured_amount   allow        │    │ within_captured_amount   allow        │
│ not_disputed             allow        │    │ not_disputed             allow        │
│ amount_approval          allow        │    │ amount_approval          allow        │
│ goodwill_approval        allow        │    │ goodwill_approval        allow        │
│                                       │    │ clustering_hold          hold         │
│                                       │    │   Kestrel $1,880 over $500 in 14 days │
└───────────────────────────────────────┘    └───────────────────────────────────────┘
```

## Tech stack

| Area | Technology |
|---|---|
| Runtime | Node 24, pnpm workspace |
| Web application | Next.js 15 (App Router, server actions), React 19 |
| Interface | Tailwind CSS 4, shadcn/ui on Radix primitives |
| Database | SQLite with better-sqlite3, Drizzle ORM and drizzle-kit migrations |
| Validation | Zod schemas on every action input |
| Audit | Hash-chained log: each entry stores the SHA-256 of the one before |
| Testing | Vitest, 331 tests |
| Quality checks | ESLint, TypeScript, boundary checks, run guard |
| CI | GitHub Actions (`.github/workflows/verify.yml`) |
| Automation | Devin v3 API with a registered playbook |

| Package | Responsibility | Depends on |
|---|---|---|
| `apps/console` | Routes, server actions, tool registry, migrations, tests | Tools, engine, UI, permissions |
| `tools/kyc`, `tools/refunds`, `tools/flags` | One operations app each: schema, rules, actions, seed data | Engine |
| `tools/automation` | Devin runs: requests, sessions, pull requests, merges | Engine |
| `packages/engine` | The governed write, policy, approvals, audit, masked data | Database packages |
| `packages/permissions` | Roles and what each may do | None |
| `packages/ui` | Shared interface components | None |
| `packages/db`, `db-write`, `db-core` | Read access, write access and the SQLite connection. Only the engine may write | None |

## Integrations

```
 Browser ──▶ Console server ──┬──▶ Devin API (v3) ....... start, poll, message and stop runs
                              ├──▶ GitHub REST API ...... PR status, checks, approving review
                              └──▶ Git and pnpm ......... pull merged code, migrate the database
```

| Service | Used for | Configuration |
|---|---|---|
| **Devin v3 API** | Starting, monitoring, messaging and stopping runs | `DEVIN_API_KEY` |
| **GitHub REST API** | Reading pull request status and checks, and posting the engineer's approval | `GITHUB_TOKEN` |
| **GitHub Actions** | Running `pnpm verify` on every pull request | `.github/workflows/verify.yml` |
| **Git and pnpm** | Pulling merged code and migrating the local database | Local checkout |

All calls to outside services are made from the server. Keys are read from a `.env` file that
is never committed and never sent to the browser. Without a Devin key the console runs normally
and shows Devin as not connected.

## Documentation

| Document | Covers |
|---|---|
| [`README.md`](../README.md) | Setup, routes, apps and scripts |
| [`CUSTOMER_FRAMING.md`](CUSTOMER_FRAMING.md) | The problem, stakeholders and scenarios |
| [`DEVIN_RUN_PROTOCOL.md`](DEVIN_RUN_PROTOCOL.md) | Operations, phases, guard checks and undo |
| [`AGENT_TRIGGER_SURFACE.md`](AGENT_TRIGGER_SURFACE.md) | Where requests start, and the run and approval screens |
| [`DEVIN-NO-DEVIN.md`](DEVIN-NO-DEVIN.md) | Which changes need Devin and which are settings |
| [`REFUND_CLUSTERING_HOLD.md`](REFUND_CLUSTERING_HOLD.md) | Specification: refund clustering hold |
| [`COMPANIES_HOUSE_CHECK.md`](COMPANIES_HOUSE_CHECK.md) | Specification: Companies House check |
| [`CHARGEBACKS_FROM_POWER_APPS.md`](CHARGEBACKS_FROM_POWER_APPS.md) | Specification: Chargebacks migration |
