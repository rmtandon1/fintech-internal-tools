# Architecture Diagram

How the console is put together, drawn in layers. The rest of `docs/` describes each part in
prose. This file shows how the parts fit together: what runs where, what calls what, and what
changes on screen when a rule is added, switched off or removed.

Diagrams in other files (see [Documentation map](#documentation-map)):

- End-to-end process: `WORKFLOW_DETAILED.md`
- Buyer's view of the whole system: `CUSTOMER_FRAMING.md`
- Short overview for a first run: `setup.md`

---

## From the screen to reviewed code

The demo does five things, in the order the Loom script does them (`LOOM-VIDEO-SCRIPT.md`).
Each starts on the screen that shows why it's needed. All five pass through the same governed
write. After that they split: switching a rule off is a setting, and the other four are Devin
runs.

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Refund clusters│ │ Live thresholds│ │ Merged changes │ │ Registry checks│ │ A Power App's  │
│ split under the│ │ and the value  │ │ nobody wants   │ │ typed in by    │ │ screens, flows │
│ manager line   │ │ that turns a   │ │ any more       │ │ hand on each   │ │ and records    │
│                │ │ rule off       │ │                │ │ business case  │ │                │
│ /t/refunds     │ │ /admin/policy  │ │ /runs          │ │ /t/kyc/<id>    │ │ /roadmap/<app> │
└───────┬────────┘ └───────┬────────┘ └───────┬────────┘ └───────┬────────┘ └───────┬────────┘
        ▼                  ▼                  ▼                  ▼                  ▼
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│    ADD a rule    │  SWITCH it OFF   │    REMOVE it     │ AUTOMATE a check │  MIGRATE an app  │
└────────┬─────────┴────────┬─────────┴────────┬─────────┴────────┬─────────┴────────┬─────────┘
         └──────────────────┴──────────────────┼──────────────────┴──────────────────┘
                                               ▼
                ┌─────────────────────────────────────────────────────────────┐
                │ Governed write in one SQLite transaction                    │
                │ executeIntent / setConstant → hash-chained audit_log row    │
                └──────────────┬───────────────────────────────┬──────────────┘
                   SWITCH OFF  │                               │  ADD · REMOVE · AUTOMATE · MIGRATE
                               ▼                               ▼
          ┌──────────────────────────────┐   ┌──────────────────────────────────────────┐
          │ runtime_constants row        │   │ context.json: evidence, live constants,  │
          │ e.g. clustering_window_days  │   │ scope globs, no PII · SHA-256 audited    │
          │ 14 → 0                       │   └────────────────────┬─────────────────────┘
          │                              │                        ▼
          │ read fresh on every decision │   ┌──────────────────────────────────────────┐
          │ no Devin, no deploy          │   │ Devin v3 API: session, playbook,         │
          └──────────────┬───────────────┘   │ attachment, structured_output polling    │
                         │                   └────────────────────┬─────────────────────┘
                         │                                        ▼
                         │                   ┌──────────────────────────────────────────┐
                         │                   │ plan.json committed before the first edit│
                         │                   │ run guard: diff = plan, plan in scope    │
                         │                   └────────────────────┬─────────────────────┘
                         │                                        ▼
                         │                   ┌──────────────────────────────────────────┐
                         │                   │ GitHub Actions: pnpm verify              │
                         │                   │ Lint · Typecheck · Boundaries · Test     │
                         │                   └────────────────────┬─────────────────────┘
                         │                                        ▼
                         │                   ┌──────────────────────────────────────────┐
                         │                   │ GitHub API: approving review from an     │
                         │                   │ engineer who didn't ask · Devin merges   │
                         │                   └────────────────────┬─────────────────────┘
                         │                                        ▼
                         │                   ┌──────────────────────────────────────────┐
                         │                   │ Merge sync: git pull --ff-only,          │
                         │                   │ db:migrate, registerToolConstants        │
                         │                   └────────────────────┬─────────────────────┘
                         └──────────────────────┬─────────────────┘
                                                ▼
              ┌────────────────────────────────────────────────────────────────────┐
              │ The same click now behaves differently, and one audit log says who │
              │ asked, who approved and what changed                               │
              └────────────────────────────────────────────────────────────────────┘
```

| Operation | Demo beat | Starts from | Devin run kind | Human gate |
|---|---|---|---|---|
| ADD a rule | Part 1, Kestrel hold | **Ask Devin for a rule**, cluster drawer | `IMPLEMENTATION/ADDITION`, scope `rule` | Engineer approves the PR |
| SWITCH it OFF | Part 1, courier outage | Constant editor, `/admin/policy` | none | Admin only, audited |
| REMOVE it | Part 1, undo | **Undo this change**, `/runs` | `REVERSAL` | Engineer approves the PR |
| AUTOMATE a check | Part 2, Companies House | **Ask Devin to add a check**, `/t/kyc/<id>` | `IMPLEMENTATION/ADDITION` | Engineer approves the PR |
| MIGRATE an app | Part 3, Chargebacks | **Ask Devin to start this app**, `/roadmap/chargebacks` | `IMPLEMENTATION/ADDITION`, scope `engine` | Engineer and engine owner |

---

## The three-layer system

The console has three layers. People click in the **console**. The **engine** decides every
write. The **source code** holds the rules the engine runs. Devin and GitHub sit to the side:
they change layer 3 and never touch layers 1 or 2 directly.

```
      Refunds agent · Refunds manager · KYC reviewer · Admin · Engineer
      (a signed "Viewing as" cookie; roles are enforced again on the server)
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────┐
│ 1  CONSOLE         what people see and click · apps/console       │
│                                                                   │
│  Queues      Record       Inbox    Policy         Runs    Devin   │
│  /t/<tool>   /t/<t>/<id>  /inbox   /admin/policy  /runs   window  │
│                                                                   │     ┌───────────────────┐
│  server actions: actions.ts, automation-actions.ts                │     │ DEVIN             │
│  route handlers: /api/devin/status, /api/devin/<runId> ───────────┼────▶│ v3 API, server    │
└──────────┬──────────────────────────────▲─────────────────────────┘     │ side only         │
           │ executeIntent(actor, intent) │ IntentResult + PolicyTrace    │                   │
           ▼                              │                               │ session, playbook │
┌─────────────────────────────────────────┴─────────────────────────┐     │ context.json,     │
│ 2  ENGINE          what decides · packages/engine                 │     │ structured_output │
│                                                                   │     └─────────┬─────────┘
│  validate → idempotency → policy → approval → effect → audit      │               │
│                                                                   │               │ branch,
│  console.db (SQLite, better-sqlite3 + Drizzle)                    │               │ plan.json,
│  refunds · kyc_cases · feature_flags · devin_runs                 │               │ edits, PR
│  approval_requests · runtime_constants · audit_log · audit_head   │               ▼
└──────────────────────────────────▲────────────────────────────────┘     ┌───────────────────┐
                                   │ registry.ts imports each tool        │ GITHUB            │
                                   │ merge sync: git pull, db:migrate,    │ Actions runs      │
                                   │ registerToolConstants                │ pnpm verify;      │
┌──────────────────────────────────┴────────────────────────────────┐     │ engineer approves │
│ 3  SOURCE CODE     what Devin changes · git                       │◀────┤ review; Devin     │
│                                                                   │     │ merges (squash)   │
│  tools/<tool>/src/index.ts     rules, actions, constants          │     └───────────────────┘
│  apps/console/src/registry.ts  the list of live apps              │
│  apps/console/tests            vitest suite (288 tests)           │
│  runs/<run_id>/                context.json + plan.json per run   │
│  scripts/run-guard.ts          the diff must match the plan       │
└───────────────────────────────────────────────────────────────────┘
```

| Layer | What it holds | Where | Example |
|---|---|---|---|
| 1 Console | Queues, record views, the approval inbox, the policy page, runs, the Devin window | `apps/console/src/app`, `apps/console/src/components` | A refunds agent clicks **Send to processor** on `rfnd_0013` |
| 2 Engine | The only write path, policy evaluation, approvals, idempotency, masked PII, the audit chain | `packages/engine`, `packages/db-core`, `packages/db-write` | `executeIntent` runs every rule on the refund, finds no hold, and settles it |
| 3 Source code | Each tool's declaration: its rules, actions, constants and seed | `tools/*`, `apps/console/src/registry.ts` | `tools/refunds/src/index.ts` lists the rules that refund just passed |

Two facts make the layers work:

- **Layer 2 knows no tool by name.** `pnpm check:boundaries` fails if `kyc`, `refunds` or
  `flags` appears in `packages/engine`, or if anything but the engine depends on
  `@console/db-write`. A new app is a new folder in layer 3 and one line in the registry.
- **Layer 3 reaches layer 2 only through a reviewed merge.** Devin never writes to
  `console.db`. The console pulls merged code, migrates its own database and registers any new
  constants. Nothing reaches layer 2 until an engineer has approved the change.

### Who does what

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ CONSOLE        │  │ ENGINE         │  │ DEVIN          │  │ GITHUB         │  │ YOU            │
│ front door and │  │ runtime        │  │ code editor    │  │ gate           │  │ orchestrator   │
│ registry       │  │                │  │                │  │                │  │                │
│                │  │ decides each   │  │ plans, edits,  │  │ runs the four  │  │ ask in one     │
│ lists apps and │  │ write; holds   │  │ tests and      │  │ checks; takes  │  │ sentence; flip │
│ runs; carries  │  │ approvals and  │  │ opens the PR;  │  │ the engineer's │  │ the off value; │
│ the evidence   │  │ the audit log  │  │ merges after   │  │ review; keeps  │  │ approve as a   │
│ into a request │  │                │  │ approval       │  │ main protected │  │ different role │
└────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘
```

| Actor | Does | Never does |
|---|---|---|
| Console | Lists live apps (`registry.ts`) and runs (`devin_runs`). Builds the run context from live state. Shows each policy trace | Writes a governed table except through the engine |
| Engine | Validates, checks idempotency, evaluates policy, freezes approvals, applies the effect and appends the audit row in one transaction | Names a tool, or calls Devin or GitHub |
| Devin | Reads the code, commits a plan, edits inside it, runs `pnpm verify`, opens the PR, merges after approval | Reads `console.db`, sees the spec on a rule run, or merges without an approving review |
| GitHub | Runs `verify.yml` on every PR. Branch protection needs one approving review and the four checks | Lets Devin's account bypass review |
| Engineer | Reviews the PR against the plan and the spec's acceptance checklist, then approves | Approves a run they asked for, or decides refund and KYC approvals |
| You (presenter or admin) | Ask, switch rules off, ask for undos, and switch roles so a different person approves | Edit rule code by hand during the demo |

---

## Tech stack

| Concern | Choice | Where |
|---|---|---|
| Runtime | Node 24, pnpm workspace | `package.json`, `pnpm-workspace.yaml` |
| Web app | Next.js 15 (App Router, server actions), React 19 | `apps/console` |
| UI | Tailwind CSS 4, shadcn/Radix primitives, sonner toasts | `packages/ui` |
| Data | SQLite through `better-sqlite3`, Drizzle ORM and drizzle-kit migrations | `packages/db-core`, `apps/console/drizzle` |
| Validation | Zod schemas on every action input | `tools/*/src/index.ts` |
| IDs and hashing | ULID ids, SHA-256 over canonical JSON for the audit chain and `context.json` | `packages/engine/src/audit` |
| Tests | Vitest | `apps/console/tests` |
| Checks | ESLint 9, `tsc`, `scripts/check-boundaries.ts`, `scripts/run-guard.ts` | `pnpm verify` |
| CI | GitHub Actions, one `verify` job | `.github/workflows/verify.yml` |
| Agent | Devin v3 API plus a registered playbook | `tools/automation`, `.devin/run-protocol.playbook.md` |

### Package boundaries

A package can import only what its `package.json` lists, so pnpm enforces the direction of
every arrow below. `check:boundaries` adds the two rules pnpm can't express.

```
                          ┌───────────────────────────┐
                          │ apps/console              │
                          │ routes, actions, registry │
                          └──┬───────────┬─────────┬──┘
                             │           │         │
               ┌─────────────┘           │         └──────────────┐
               ▼                         ▼                        ▼
┌─────────────────────────────┐  ┌───────────────┐  ┌──────────────────────────────┐
│ tools/kyc     tools/refunds │  │ packages/ui   │  │ packages/permissions         │
│ tools/flags   tools/automat.│  │ shadcn views  │  │ roles, levels, domains       │
└──────────────┬──────────────┘  └───────────────┘  └──────────────────────────────┘
               │ declare(): rules, actions, schema, seed
               ▼
┌─────────────────────────────┐        ┌──────────────────────────────────────────┐
│ packages/engine             │───────▶│ packages/db-write                        │
│ executeIntent, policy,      │        │ the write handle; only the engine may    │
│ approvals, audit, pii       │        │ depend on it                             │
└──────────────┬──────────────┘        └────────────────────┬─────────────────────┘
               ▼                                            ▼
┌─────────────────────────────┐        ┌──────────────────────────────────────────┐
│ packages/db                 │───────▶│ packages/db-core                         │
│ read client                 │        │ SQLite connection + engine tables        │
└─────────────────────────────┘        └──────────────────────────────────────────┘
```

---

## The governed write path

Every write in the console, a refund, a KYC approval, a flag rollout or a Devin dispatch, runs
the same six steps (`packages/engine/src/execute-intent.ts`). Steps 2 to 6 share one
transaction, so a crash rolls back the effect, the audit row and the idempotency key together.

```
 intent { tool, action, recordId, input, idempotencyKey }
    │
    ▼
┌──────────────┐   role may use the tool and the action? input parses (Zod)?
│ 1 validate   │   record exists and its status allows this action?
└──────┬───────┘                                                    no ──▶ error, nothing written
       ▼          ┌─ one transaction ─────────────────────────────────────────────────────────┐
┌──────────────┐  │  same key, same payload ──▶ replay the stored result                      │
│ 2 idempotency│  │  same key, other payload ──▶ idempotency_conflict                         │
└──────┬───────┘  │                                                                           │
       ▼          │                                                                           │
┌──────────────┐  │  every rule runs, constants read fresh ──▶ allow | approval | deny        │
│ 3 policy     │  │                                                     deny ──▶ audit row    │
└──────┬───────┘  │                                                                           │
       ▼          │                                                                           │
┌──────────────┐  │  require_approval ──▶ approval_requests row with the frozen payload,      │
│ 4 approval   │  │                       trace and record version; audit row; stop           │
└──────┬───────┘  │                                                                           │
       ▼          │                                                                           │
┌──────────────┐  │  the tool's apply(): the only code that changes a governed row            │
│ 5 effect     │  │                                                                           │
└──────┬───────┘  │                                                                           │
       ▼          │                                                                           │
┌──────────────┐  │  audit_log row: seq, prev_hash, row_hash, before/after, policy trace      │
│ 6 audit      │  │  audit_head moves forward in the same write                               │
└──────────────┘  └───────────────────────────────────────────────────────────────────────────┘
```

An approval resumes at step 5 with the frozen payload (`executeApproved`). The SQL that picks
the request excludes the requester, so a manager can't approve their own request.

Every app inherits seven controls from this path: role access, a policy check on every action,
approvals, live settings, idempotency, masked personal data and the audit log. That's why the
Coming soon tiles can list them before anyone has written a line of the app.

---

## Integrations

The browser never calls an outside service. Every call below starts on the server, and
`DEVIN_API_KEY` and `GITHUB_TOKEN` stay in the repo-root `.env`.

```
 BROWSER                  CONSOLE SERVER                          OUTSIDE
 ─────────────            ───────────────────────────────         ─────────────────────────────

 Devin window ──fetch──▶  /api/devin/<runId>                      api.devin.ai/v3
 (polls a run)            /api/devin/status  ───────────────────▶ GET    /self                org from key
                          tools/automation/devin-api              POST   .../attachments      context.json
                                                                  POST   .../sessions         prompt, playbook
                                                                  GET    .../sessions/<id>    status, output
                                                                  POST   .../<id>/messages    reply, merge
                                                                  DELETE .../sessions/<id>    Stop run

 Approval dialog ──────▶  automation-actions.ts                   api.github.com
 (engineer)               tools/automation/github-api  ─────────▶ GET    .../pulls/<n>        head, state
                                                                  GET    .../check-runs       4 checks
                                                                  GET    .../contents/<path>  context hash
                                                                  POST   .../pulls/<n>/reviews  APPROVE

 Check merge,             apps/console/src/lib/bridge  ─────────▶ git pull --ff-only origin
 Reconcile                                                        pnpm db:migrate
                                                                  registerToolConstants()

                          scripts/register-playbook  ───────────▶ Devin playbook
                          (pnpm devin:playbook)                   "Governed console run"

 Part 2, not built yet    tools/kyc Companies House client  ────▶ Companies House API
                          (recorded responses in tests)           (Devin reads its docs itself)

 Part 3 input             fixtures/power-apps/chargebacks         Power Apps export, committed:
                                                                  2 screens, 2 flows, disputes
```

| Integration | Needs | Without it |
|---|---|---|
| Devin v3 | `DEVIN_API_KEY`. `DEVIN_ORG_ID` and `DEVIN_PLAYBOOK_ID` are optional overrides | The console runs, the Devin window says `Devin not connected`, and dispatch is refused before anything is written |
| GitHub REST | `GITHUB_TOKEN` (the engineer's) | **Review and approve** and the merge check are unavailable |
| GitHub Actions | `verify.yml` and branch protection on the integration branch | PRs can't meet the four required checks |
| Companies House | Added by the Part 2 run | The case keeps its hand-typed check |
| Power Apps export | `fixtures/power-apps/chargebacks/` | **Ask Devin to start this app** stays unavailable |

---

## Workflows

### Change a rule (ADD, AUTOMATE, MIGRATE)

Swimlanes for one run, read top to bottom. `▣` marks an audited intent (a `devin_runs` change
plus an `audit_log` row). `○` marks a state the console reads by polling and keeps in memory.

```
 REQUESTER          CONSOLE + ENGINE            DEVIN                  GITHUB            ENGINEER
 (manager/admin)
 ───────────        ───────────────────         ─────────────          ──────────        ─────────
 sees the pattern
 Ask Devin ───────▶ handoff panel: sentence,
                    evidence, scope
 Start run ───────▶ ▣ dispatch
                    context.json + SHA-256
                    POST /sessions ───────────▶ ○ intake
                    ▣ record_session             ○ baseline (verify at base)
                                                 ○ plan: commit context.json
                                                   + plan.json first
                                                 ○ edit inside the plan
                                                 ○ verify ──────────────▶ Lint, Typecheck,
                                                                          Boundaries, Test
                                                 ○ pull request ────────▶ PR open
                    ▣ record_pr ◀── poll sees pr_url
                                                                                          opens the run
                    approval dialog ◀─────────────────────────────────────────────────── Review and
                    checks green? context hash matches? approver ≠ requester?             approve
                    ▣ approve_pr
                    POST /reviews APPROVE ───────────────────────────────▶ review on PR
                    message: merge ────────────▶ squash merge ──────────▶ merged
                    ▣ record_merge ◀── poll sees merge_commit
                    git pull · db:migrate ·
                    registerToolConstants
 same click, new ◀─ rule runs on the next write
 outcome
```

A normal run leaves five audit rows: `dispatch`, `record_session`, `record_pr`, `approve_pr`
and `record_merge`. A run that ends early ends with `stop` or `dispatch_failed` instead.

### SWITCH it OFF

```
 ADMIN                     CONSOLE + ENGINE                              EFFECT
 ─────                     ─────────────────────────────────             ─────────────────────────
 /admin/policy
 clustering_window_days
 14 ──▶ 0, Save ─────────▶ setConstant: admin only, type-checked
                           runtime_constants row updated          ──▶ next refund: the rule runs,
                           audit_log row, before 14, after 0           reads 0 and answers allow
```

No run, no PR and no deploy. The code doesn't change, so setting the value back to 14 turns
the rule on again.

### REMOVE it

```
 ADMIN                CONSOLE + ENGINE            DEVIN                                 ENGINEER
 ─────                ─────────────────           ──────────────────────────────        ─────────
 /runs
 Undo this change ──▶ ▣ dispatch REVERSAL
                      reverses: run id +
                      merge commit ─────────────▶ git revert -m 1 <merge>
                                                  conflict in tools/refunds/src/index.ts
                                                  keep partial_delivery (merged later)
                                                  remove clustering_hold, its KYC check,
                                                  its constant and its tests
                                                  PR lists what code can't undo:
                                                  60 held refunds, the constant row
                      ▣ record_pr ◀────────────── PR open
                      ▣ approve_pr ◀─────────────────────────────────────────────────── approves
                      message: merge ───────────▶ squash merge
                      ▣ record_merge ◀─────────── merge_commit
                      rule gone from every trace
```

---

## Automation: the run lifecycle

States of one `devin_runs` row. `▣` transitions are audited intents written to the table.
`○` states come from polling the Devin session and are never stored. Every `○` phase can stop
the run.

```
 Start run
     │
     ▼
 dispatch rules ─── deny ───▶ refused: wrong role, a run already in flight
     │ allow                  on this tool, or no evidence. Nothing written
     ▼
 ▣ dispatched ──▶ ▣ session recorded ─── no session ───▶ ▣ dispatch_failed
                       │
   ┌───────────────────┘
   ▼
 ○ intake ──▶ ○ baseline ──▶ ○ plan ──▶ ○ edit ──▶ ○ verify ──▶ ○ pull request
   │            │              │          │          │            │
   └────────────┴───────────┬──┴──────────┴──────────┘            │ poll sees pr_url
                            │ a phase fails, Stop run,            ▼
                            │ or the session ends               ▣ pr_open
                            ▼                                     │ engineer approves
                          ▣ stopped                               ▼
                                                                ▣ approved
 ○ waiting for a reply: any ○ phase                               │ Devin merges
   can pause; the reply box answers it                            ▼
   and the phase carries on                                     ▣ merged
                                                                  │
                                                                  ▼
                                                  git pull · db:migrate · constants
```

| Phase | Passes when | On failure |
|---|---|---|
| Intake | The spec is registered in `specs.ts`, the context parses and the base commit is current | Stop, no branch |
| Baseline | `pnpm verify` is green at the base, and per-file test counts are recorded | Stop, no branch |
| Plan | `context.json` and `plan.json` are the branch's first commit, alone | Stop, delete the branch |
| Edit | Only files in the plan change | Reset to the plan commit, stop |
| Verify | `pnpm verify` is green and test counts are at or above baseline | Two fixes inside the plan, then stop |
| Pull request | A PR is open against the integration branch | Leave the branch, report |
| Merge | An engineer has approved, and Devin squash-merges | Report and wait, rebasing inside the plan |

The run guard (`scripts/run-guard.ts`, part of `pnpm verify`) checks the four claims that
matter: **Stays in plan**, **Plan stays in scope**, **Run dir frozen** and, for rule scope,
**Engine untouched**. The console adds **Context untouched** at approval, because only the
console can read the hash in its own audit row. Full rules: `DEVIN_RUN_PROTOCOL.md`.

---

## UI states

Sketches of the screens each operation passes through, and how they change. The layout is
still being revisited (`CONSOLE_ROLE_VIEWS.md`), so these show content and state, not
pixel-level design.

### Refunds queue and cluster drawer

```
 BEFORE THE RULE (refunds manager)             RULE LIVE (refunds manager)
┌───────────────────────────────────────┐     ┌───────────────────────────────────────┐
│ Refunds · 14            ◐ monitor     │     │ Refunds · 14            ◐ monitor     │
│ ┌───────────────────────────────────┐ │     │ ┌───────────────────────────────────┐ │
│ │ 4 refunds from Kestrel Outdoors   │ │     │ │ 4 refunds from Kestrel Outdoors   │ │
│ │ add up to $1,880                  │ │     │ │ add up to $1,880                  │ │
│ │ $465  $460  $475  $480            │ │     │ │ $465  $460  $475  $480 held       │ │
│ │ each under the $500 manager line  │ │     │ │ covered by clustering_hold        │ │
│ │                                   │ │     │ │                                   │ │
│ │ No rule covers this               │ │     │ │ window 14 days · /admin/policy    │ │
│ │ [ Ask Devin for a rule ]          │ │     │ │ [ View run ]                      │ │
│ └───────────────────────────────────┘ │     │ └───────────────────────────────────┘ │
└───────────────────────────────────────┘     └───────────────────────────────────────┘
 A refunds agent sees the rows and the total, but no Ask Devin button.
```

### Devin window: handoff, then run

```
 HANDOFF (before Start run)                    RUN (after Start run, same window)
┌───────────────────────────────────────┐     ┌───────────────────────────────────────┐
│ ◆ Devin              context preview  │     │ ◆ Devin  New rule · verify   [Stop]   │
├───────────────────────────────────────┤     ├───────────────────────────────────────┤
│ REQUEST                               │     │ ✓ Inspecting architecture    1a67f60  │
│ ┌───────────────────────────────────┐ │     │ ✓ Baseline green             288      │
│ │ Once a merchant's "not received"  │ │     │ ✓ Reusing execute-intent.ts           │
│ │ refunds add up past the manager   │ │     │ ✓ Reusing approvals.ts                │
│ │ limit, send them to a manager…    │ │     │ ✓ Plan committed             c7d19e2  │
│ └───────────────────────────────────┘ │     │ ✓ Editing clustering-hold.ts +84      │
│ CONTEXT                               │     │ ● Verify  Lint ✓ Types ✓ Bounds ✓     │
│ Kestrel Outdoors · 4 rows · no PII    │     │           Test …                      │
│ manager line $500 · KYC score 70      │     │ ○ Tests                  288 → …      │
│ base 1a67f60                          │     │ ○ Opening pull request                │
│ GUARDRAILS                            │     ├───────────────────────────────────────┤
│ tools/refunds/** · tools/kyc/** ·     │     │ Plan                                  │
│ tests · runs/                         │     │ create tools/refunds/src/clustering-… │
│ Checks: Lint · Typecheck ·            │     │ modify tools/refunds/src/index.ts     │
│ Boundaries · Test                     │     │ modify tools/kyc/src/index.ts         │
│ EXECUTION           [ Start run ]     │     │ …                                     │
└───────────────────────────────────────┘     └───────────────────────────────────────┘
 Without DEVIN_API_KEY the header reads "Not connected" and Start run is refused.
```

### Approval dialog

```
 IDLE                                          AFTER APPROVE
┌───────────────────────────────────────┐     ┌───────────────────────────────────────┐
│ Approve PR #14 · clustering_hold      │     │ Approve PR #14 · clustering_hold      │
│ Requested by Refunds manager          │     │ ✓ ⌥GH  Approving review submitted     │
│ 5 files · +146 −3      View diff ⌥GH  │     │ ◌ ◆D   Devin merging (squash)         │
│ Checks lint ✓ types ✓ bounds ✓ test ✓ │ ──▶ │ ✓ ◆D   Merged · a3f9c21               │
│ Context untouched ✓                   │     │ ✓      Pulled into local checkout     │
│ Acceptance: ☐ ☐ ☐ ☐ ☐ ☐ ☐ ☐           │     │ ✓      Audit row · merge recorded     │
│         [ Cancel ] [ Approve ]        │     │                           [ Close ]   │
└───────────────────────────────────────┘     └───────────────────────────────────────┘
 Shown only to an engineer who didn't request the run.
 Failure states: checks re-running, or a merge conflict with a newer merge.
```

### Record view: the same click, before and after

```
 rfnd_0013, BEFORE (refunds agent)             rfnd_0011, AFTER MERGE (refunds agent)
┌───────────────────────────────────────┐     ┌───────────────────────────────────────┐
│ [ Send to processor ]                 │     │ [ Send to processor ]                 │
│ ✓ Settled                             │     │ Pending approval · manager            │
│ Policy trace                          │     │ Policy trace                          │
│  within_captured_amount  allow        │     │  within_captured_amount  allow        │
│  not_disputed            allow        │     │  not_disputed            allow        │
│  amount_approval         allow        │     │  amount_approval         allow        │
│  goodwill_approval       allow        │     │  goodwill_approval       allow        │
│                                       │     │  clustering_hold   require_approval   │
│                                       │     │   Kestrel · $1,880 > $500 · 14 days   │
└───────────────────────────────────────┘     └───────────────────────────────────────┘
```

### The rule's lifecycle

`live` and `off` run the same code. Only a reversal takes the rule out of the code.

```
 ┌────────┐ Ask Devin ┌───────────┐ PR opens ┌─────────┐ approve + merge ┌────────┐
 │ absent │──────────▶│ requested │─────────▶│ pr_open │────────────────▶│  live  │◀─────┐
 └────────┘           └───────────┘          └─────────┘                 └───┬────┘      │
     ▲                                                                       │ window    │ window
     │                                                                       │ 14 → 0    │ 0 → 14
     │ approve + merge                                                       ▼           │
 ┌───┴────────────┐  PR opens  ┌────────────────┐    Undo this change    ┌────────┐      │
 │ undo pr_open   │◀───────────│ undo requested │◀───────────────────────│  off   │──────┘
 └────────────────┘            └────────────────┘                        └────────┘
                                                             (Undo also works from live)
```

---

## Before and after: state snapshots

The Kestrel rule across Part 1, one column per layer. Each snapshot is what you'd find if you
stopped the demo at that point.

```
                  CODE (layer 3)                 SETTINGS (layer 2)            CLICK ON A KESTREL REFUND
                  ────────────────────────────   ──────────────────────────   ─────────────────────────
 1 BEFORE         no clustering-hold.ts          manager line $500            rfnd_0013 settles
                  Send to processor runs 4       no window constant           trace: 4 rules, all allow
                  rules, none per merchant
                                     │
                                     │ ADD: run, PR, engineer approves, Devin merges
                                     ▼
 2 RULE LIVE      clustering-hold.ts             manager line $500            rfnd_0011 held for a
                  + linked_refund_hold (kyc)     window 14 days               manager; kyc_0013 needs
                  + tests, 1 test changed        (registered on merge)        a KYC manager
                                     │
                                     │ SWITCH OFF: admin sets the window to 0
                                     ▼
 3 SWITCHED OFF   unchanged from 2               window 0 days                rfnd_0012 settles;
                                                 audit row: 14 → 0            trace still lists
                                                                              clustering_hold: allow
                                     │
                                     │ REMOVE: reversal run, conflict resolved, approved, merged
                                     ▼
 4 REMOVED        clustering-hold.ts gone        window row still in the      rfnd_0014 settles;
                  kyc hold gone, tests gone      live database (listed in     clustering_hold gone
                  partial_delivery KEPT          the PR as an operator step)  from the trace
```

**Restoring it:**

| From | Back to | How | Time |
|---|---|---|---|
| 3 Switched off | 2 Live | Set `refunds.clustering_window_days` back to 14 on `/admin/policy` | Seconds, one audit row |
| 4 Removed | 2 Live | Ask again with the same sentence. The first run's request and plan are still in `runs/<run_id>/` | One run and one review |
| 2 Live | 1 Before | Not a separate path. Undo goes to 4, which is 1 plus the work merged since | One run and one review |

Git keeps every version, and `runs/<run_id>/` keeps each run's context and plan. There's no
separate backup to restore from, and no copy of source files that could drift.

---

## Timeline view

The whole demo on one axis. Each tick is a moment the audit log records.

```
 PART 1: A RULE, FROM ADDED TO REMOVED
 ├─ rfnd_0013 settles ($925 from Kestrel so far) ....................... refunds agent
 ├─ Ask Devin for a rule ▣ dispatch ..................................... refunds manager
 │   ├─ ▣ record_session   ○ intake → baseline → plan → edit → verify    Devin
 │   ├─ ▣ record_pr        PR open, 4 checks green                       Devin, GitHub
 │   ├─ ▣ approve_pr       8 acceptance behaviours ticked                engineer
 │   └─ ▣ record_merge     pulled, constant registered                   Devin, console
 ├─ rfnd_0011 held ▣  ·  kyc_0013 needs a KYC manager ▣ ................. agent, KYC reviewer
 ├─ partial_delivery merged (ordinary PR) · courier outage: 60 held ▣ ... setup
 ├─ window 14 → 0 ▣ ..................................................... admin
 ├─ rfnd_0012 settles ▣ ................................................. refunds agent
 ├─ Undo this change ▣ dispatch REVERSAL ................................ admin
 │   └─ conflict resolved · ▣ record_pr · ▣ approve_pr · ▣ record_merge  Devin, engineer
 └─ rfnd_0014 settles, clustering_hold gone ▣ ........................... refunds agent

 PART 2: A MANUAL STEP REMOVED
 ├─ kyc_0104: registry check "checked by hand" .......................... KYC reviewer
 ├─ Ask Devin to add a check ▣ dispatch ................................. admin
 │   └─ Companies House client + recorded responses · PR · approve · merge
 └─ run the check → late accounts → Approve needs a manager ▣ ........... KYC reviewer

 PART 3: THE NEXT APP, STARTED
 ├─ /roadmap/chargebacks: Power App export, 2 flows ..................... admin
 ├─ Ask Devin to start this app ▣ dispatch (engine scope) ............... admin
 │   └─ tools/chargebacks/ · registry line · migration · to-do list · PR
 │      approved by the engineer and the engine owner
 └─ /t/chargebacks live: accept a $2,480 fraud dispute → manager ▣ ...... refunds agent
```

---

## Documentation map

Where each diagram lives, so a reader can go one level deeper.

```
                        README.md
                        setup, routes, apps, scripts, layout,
                        technical details in brief
                                    │
          ┌─────────────────────────┼──────────────────────────┐
          ▼                         ▼                          ▼
 setup.md                  ARCHITECTURE_DIAGRAM.md     CUSTOMER_FRAMING.md
 small architecture        (this file) layers,          full system diagram,
 overview                  stack, integrations,         problem, stakeholders,
                           workflows, states            scenarios
                                    │
          ┌─────────────────────────┼──────────────────────────┐
          ▼                         ▼                          ▼
 WORKFLOW_DETAILED.md      DEVIN_RUN_PROTOCOL.md       AGENT_TRIGGER_SURFACE.md
 end to end process        run kinds, phases,          where runs start, handoff
                           guards, reversal            panel, run view, dialog
                                    │
          ┌─────────────────────────┼──────────────────────────┐
          ▼                         ▼                          ▼
 REFUND_CLUSTERING_HOLD.md  COMPANIES_HOUSE_CHECK.md   CHARGEBACKS_FROM_POWER_APPS.md
 Part 1 spec                Part 2 spec                Part 3 spec
```

| File | Diagram it holds | Status |
|---|---|---|
| `ARCHITECTURE_DIAGRAM.md` | Layers, stack, integrations, workflows, run lifecycle, UI states, snapshots, timeline | This file |
| `WORKFLOW_DETAILED.md` | End-to-end process, linked from the README as the workflow reference | To be written |
| Workflow doc for the two core operations (name to be decided) | Adding a rule and removing it, in more detail | To be written |
| `README.md` | Brief technical details: console architecture, data schema, backups, step-by-step workflows | To be added |
| `CUSTOMER_FRAMING.md` | Full system architecture diagram | To be added |
| `setup.md` | Small architecture overview | To be written |
| `rule-change-workflow.svg` | The rule change as a flowchart, S0 to S11 | Exists |
