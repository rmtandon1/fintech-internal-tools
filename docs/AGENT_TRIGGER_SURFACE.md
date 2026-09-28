# Agent Trigger Surface

How a request to Devin starts, what the requester sees, and where the human gate shows. Run
mechanics are in `DEVIN_RUN_PROTOCOL.md`; this file covers the screens around them.

## Summary

- A request starts on the screen that shows why it's needed: a KYC case, a large refund, or
  an app that's coming soon. The request carries that screen's record as evidence.
- The handoff panel shows the request, written in advance and editable, and everything the
  console attaches. The requester sees exactly what Devin will see.
- Who can ask is visible, not described. A role one step away sees the button greyed out with
  who can; a role further away doesn't see it.
- The run view shows what a reviewing engineer would check: planned files, lines changed, the
  checks by name and how long it took.
- The approval dialog is the human gate: an engineer who didn't ask approves, then Devin merges.

## Where each request starts

| Change | Screen | Button | Who can press it | Greyed out for |
|---|---|---|---|---|
| Companies House check (`COMPANIES_HOUSE_CHECK.md`) | A UK business case, `/t/kyc/<id>` | **Ask Devin to add a check** | KYC manager, admin | — |
| Two-person approval (`TWO_PERSON_APPROVAL.md`) | A refund at or above the admin limit, `/t/refunds/<id>` | **Ask Devin for a second approver** | Admin | Refunds manager |
| Chargebacks app (`CHARGEBACKS_FROM_POWER_APPS.md`) | The Coming soon page, `/roadmap/chargebacks`, once its export is committed | **Ask Devin to build this app** | Admin | Every manager |
| Undo any merged change | A merged run in `/runs` | **Undo this change** | Admin | — |

The rules behind the table live in `apps/console/src/lib/run-triggers.ts` (which record shows
which button) and `roleMayStart` in `tools/automation/src/index.ts` (who may send it). The
dispatch applies the same rules again, so a greyed-out button can't be worked around.

A change that's already merged doesn't offer itself again. Switching a rule off is a setting on
`/admin/policy`, with no Devin involved.

## The handoff panel

It opens in the Devin window (`apps/console/src/components/handoff-panel.tsx`) and holds:

- **What Devin will see.** Each evidence row with its facts, read column by column from an
  allowlist: a business's registration, a refund's amount and reason, an export's files. A line
  underneath says people's names, emails, card numbers and ID documents are never shared.
- **The request.** Prefilled from the spec in `tools/automation/src/specs.ts`, up to 500
  characters, and the requester's to edit. It's the whole brief Devin gets. An undo carries no
  free text.
- **Technical details**, collapsed: the change kind, the base commit, the settings snapshot,
  the allowed files, and the checks the pull request must pass.
- **Send to Devin**, disabled when the server has no Devin key. The panel then says Devin isn't
  connected, and nothing is sent or recorded.

## Why the request starts from a record, not a chat

The requester isn't starting an open conversation. They're asking for a specific change about a
record already on screen: this company, this refund, this app. Starting from the record skips
the round trip from structured state to prose and back, and the step where a request gets
dispatched against the wrong record.

The prompt is written in advance because a good brief is work. It names the outside API to
look up, the design engineering agreed, or the export to read. The requester can change it,
and the one they send is recorded on the run.

## The run view

It shows the artifacts a reviewing engineer would check, not a spinner, and only what the
session reports, as it reports it. The finished run is the frame the demo pauses on.

- **Summary:** the request, who asked, the kind of change in plain words (New rule, Rule change, Rule removal, Undo a change), the status, and what changes once it merges.
- **Checklist:** one glance, `✓` done, `●` running, `○` waiting, read from the session's
  structured output. Reuse lines come from the plan, so the change is seen sitting on the
  existing engine.
- **Timeline:** one segment per phase sized by how long it took, with the total ("Took …")
  above it.
- **Files:** each planned file with create or modify, its +/− lines and a one-line reason.
- **Checks:** `pnpm verify` split into Lint, Typecheck, Boundaries, Run guard and Test, then each
  guard by name (`DEVIN_RUN_PROTOCOL.md` § Guard checks).
- **For an undo:** what it undoes (run, request, merge commit and pull request), and each
  conflict with what was kept and what was removed.

## The approval dialog

A modal over the run view, with the Devin and GitHub marks on the rows each one owns. The top
half is the pull request: files, lines, checks, "context untouched", and the reviewer's checklist
from the spec (`RunnableSpec.acceptance`), which Devin never saw. After **Approve as engineer**,
the lower half fills in row by row: review submitted on GitHub, Devin merging, merged, pulled
into the console, audit row written.

The approver can't be the requester, so the presenter switches to the engineer role first.
That switch is part of the point: a different person approves.

## `/runs`

Every change Devin has been asked for: kind, request, requester, status, pull request, and the
change it undoes, if any. It reads `devin_runs` for state. **Undo this change** sits on merged
additions, for the admin. For the engineer, **Reconcile** re-reads every approved run's pull
request on GitHub, records the ones that merged, and pulls the newest merge into the console.
