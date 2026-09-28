# Documentation

This directory contains detailed technical documentation about the implementation, design decisions, and solutions to problems encountered during development.

The stakeholder view is found at [`../CUSTOMER_FRAMING.md`](../CUSTOMER_FRAMING.md). Repository setup, routes and
scripts are in the root [`README.md`](../README.md).

## Table of Contents

### Getting Started

- [SETUP.md](SETUP.md) — running in 5 minutes, with the expected output of every step
- [INTEGRATION-SETUP.md](INTEGRATION-SETUP.md) — full operational runbook: what serves from where, verification checklist, recovery and an integration test script

### Devin API Integration

- **⚠ [DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md) — how a run stays honest: the plan committed before the first edit, the context hash checked at approval, and the guard that holds the diff to the plan. Read this before changing anything under `tools/automation/` or `.devin/`.**
- [DEVIN_SETUP_GUIDE.md](DEVIN_SETUP_GUIDE.md) — API key, organisation, repository access and the run playbook
- [DEVIN_API_SETUP.md](DEVIN_API_SETUP.md) — the console's Devin API calls, the server-side proxy, and fixes for CORS, 401/403 and network errors
- [DEVIN-NO-DEVIN.md](DEVIN-NO-DEVIN.md) — which changes need Devin and which are settings
- [DEVIN-CLUSTERING-HOLD-SPEC.md](DEVIN-CLUSTERING-HOLD-SPEC.md) — agent-facing spec for the refund clustering hold: current-state audit, exact edits, validation
- [`../.devin/run-protocol.playbook.md`](../.devin/run-protocol.playbook.md) — the playbook body every session follows

### GitHub Integration

- [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) — token permissions, API calls, CI jobs, CODEOWNERS, branch protection and the merge sync
- [DEVIN_RUN_SYNC_FIXES.md](DEVIN_RUN_SYNC_FIXES.md) — six defects between Devin, GitHub and the console, with root causes and fixes
- [POST_MERGE_DEPLOYMENT_DRIFT.md](POST_MERGE_DEPLOYMENT_DRIFT.md) — troubleshooting post-merge deployment drift: the running console behind the merged branch, diagnosed from GitHub down to the checkout and fixed in four layers
- [AUTO_PR_DETECTION.md](AUTO_PR_DETECTION.md) — how the console detects a run's pull request and merge by polling, and the GitHub rate-limit math

### Architecture & Design

- [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md) — the three layers, the governed write, integrations, workflows and the rule lifecycle
- [WORKFLOW_EXPLAINED.md](WORKFLOW_EXPLAINED.md) — Complete Workflow: Dynamically Changing the Rules (add, switch off, remove)
- [WORKFLOW_DETAIL.md](WORKFLOW_DETAIL.md) — Complete Workflow: Converting Cross-Platform (a Power App moved into the console)
- [AGENT_TRIGGER_SURFACE.md](AGENT_TRIGGER_SURFACE.md) — where runs start, the handoff panel, the run view and the approval dialog
- [CONSOLE_ROLE_VIEWS.md](CONSOLE_ROLE_VIEWS.md) — what each role can see, and the Devin window controls
- [rule-change-workflow.svg](rule-change-workflow.svg) — "How work reaches the console" (source: [rule-change-workflow.excalidraw](rule-change-workflow.excalidraw))
- [demo-loop.svg](demo-loop.svg) — the demo's loop, run three times, as shown on slide 1 (source: [demo-loop.excalidraw](demo-loop.excalidraw))

### Dashboard Features

- [TRANSACTION_INSPECTION.md](TRANSACTION_INSPECTION.md) — the refunds cluster strip and drawer
- [KYC_CASE_FILE.md](KYC_CASE_FILE.md) — checks, Declared vs found, PEP and material-difference approvals
- [QUEUE_STATS_STRIP.md](QUEUE_STATS_STRIP.md) — three role-specific counts on every queue
- [ACTION_OUTCOME.md](ACTION_OUTCOME.md) — the panel that shows what the engine did after a click

### Demo Scenario Briefs

The console registers these by file name in `tools/automation/src/specs.ts`. Don't rename them.

- [REFUND_CLUSTERING_HOLD.md](REFUND_CLUSTERING_HOLD.md) — Part 1: a rule, added, switched off and removed
- [COMPANIES_HOUSE_CHECK.md](COMPANIES_HOUSE_CHECK.md) — Part 2: a manual lookup automated
- [CHARGEBACKS_FROM_POWER_APPS.md](CHARGEBACKS_FROM_POWER_APPS.md) — Part 3: the first pull request of a Power Apps migration

### Code Quality & CI/CD

- [CODE_QUALITY.md](CODE_QUALITY.md) — `pnpm verify`: lint, typecheck, boundaries, run guard, tests, and the CI workflow

### Progress Tracking Iterations

- [DEMO_BEFORE_STATE_READY.md](DEMO_BEFORE_STATE_READY.md) — Parts 2 and 3 built by Devin, reverted to the before-state, now landing switched off
- [REAL_TIME_PROGRESS_READY.md](REAL_TIME_PROGRESS_READY.md) — the run view's live checklist and timeline

---

## Key Technical Solutions

### Devin Prompt Engineering

A run starts from one sentence on the screen that shows the need, not from a chat. The console
turns it into a governed request:

- **The sentence and a snapshot, nothing else.** The prompt is the operator's sentence, the run
  id, the repository with base branch and commit, and an attached `runs/<run_id>/context.json`:
  live settings, evidence rows with personal data dropped, allowed paths and the audit head.
- **No answer key.** Rule and check runs are told not to open the feature specs under `docs/`;
  Devin works out the window, the edge cases and the trace position from the code and its tests.
  Only a spec marked `sendSpec` (Chargebacks) is named, and then only its "sent to Devin" section.
- **A registered playbook.** `.devin/run-protocol.playbook.md`, registered by
  `pnpm devin:playbook`, fixes the phases: intake, baseline, plan, edit, verify, pull request,
  merge.
- **Structured progress.** Sessions must report `structured_output` against the
  `StructuredOutput` schema at every phase boundary, so the run view shows files, line counts and
  checks as they happen, never on a timer.

Details: [DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md),
[AGENT_TRIGGER_SURFACE.md](AGENT_TRIGGER_SURFACE.md) § Why the request is one sentence.

### Plan Before Edit

Devin's first commit is `context.json` and `plan.json` alone. CI's run guard then fails any file
outside the plan, any planned path outside the allowed paths, and any later change to either
file. At approval, the console checks the branch's `context.json` hashes to the value stored in
the dispatch audit row. The engineer reviews a diff against a list Devin wrote before it knew
what the diff would be.

### The Governed Write

Every write, whether a refund, a KYC decision, a flag change or a Devin request, runs through
`executeIntent`: validate, idempotency, policy, approval, effect, audit, in one transaction. A new
app inherits roles, approvals, live settings, masking and the audit log without engine code.
Details: [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md) § The governed write.

### Switch-Off Without a Flag

Every rule Devin adds reads a setting with an off value, editable on `/admin/policy` and applied
on the next decision. A misfiring rule stops in seconds, then an undo removes it from the code.
New apps land behind a feature flag instead. Details:
[DEVIN-NO-DEVIN.md](DEVIN-NO-DEVIN.md) § Policy rules and product flags.

### Merge Sync

The console never pushes. After Devin merges, it fast-forwards its own checkout, runs pending
migrations and registers new settings, refusing to pull into a dirty tree or the wrong branch.
Details: [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) § Merge sync.

### Linting & Code Quality

`pnpm verify` runs ESLint (Next's recommended set), strict TypeScript across every package, the
boundary check (the engine names no tool; only the engine holds the write client), the run guard
and the Vitest suite, with live HTTP disabled under test. CI runs the same checks and posts the
guard report on every pull request. Details: [CODE_QUALITY.md](CODE_QUALITY.md).

---

## Video Demo Script

See [LOOM-VIDEO-SCRIPT.md](LOOM-VIDEO-SCRIPT.md) for the complete demo script showing all features in action.
Its four slides are [DEMO-SLIDES.html](DEMO-SLIDES.html) (PDF: [DEMO-SLIDES.pdf](DEMO-SLIDES.pdf)); the script cues each one, and the last gives the build-vs-buy recommendation.
