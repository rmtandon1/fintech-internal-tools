# Privileged Action Justification

## Summary

- Compliance requires a reason and a ticket reference on every privileged action, recorded in the tamper-evident audit log. Today the actions that let a customer in, send money out, loosen a control or expose personal data record neither.
- It changes a requirement every app shares, so it lives in the engine, not a tool folder. It runs with engine scope: the engine owner approves as well as an engineer.
- It is the demo's stress test. The obvious fix covers one of five places the console writes audit rows, and the repo's `AGENTS.md` points at that one.
- Three Devin sessions run it in parallel from the same prompt. Each is scored against the reviewer checklist, and all three results are published.
- Before approving, the reviewer tries each privileged action in the console and runs `/audit/verify`, so a missed path is caught before merge.
- Framing: `CUSTOMER_FRAMING.md` § 3 › "5. One control, every app". Shared run rules: `DEVIN_RUN_PROTOCOL.md`, scope `engine`.

## The problem

Internal audit samples refunds sent to the processor and asks for the ticket that authorised each one. The console can't answer. What it records today:

| Action | Why it was done | Ticket |
|---|---|---|
| KYC reject, request info, escalate | Required reason, 5–500 characters | None |
| Refunds reject, mark failed | Required reason | None |
| Flags enable, disable, set rollout, archive | Required reason | None |
| **KYC approve** | Optional note | None |
| **Refunds send to processor** | Optional note | None |
| Refunds mark settled | Processor reference (bookkeeping, not a decision) | None |
| **Approve a pending request** | Optional note | None |
| Reject a pending request | Required, but the form fills in "No reason given" | None |
| **Edit a policy constant** | Nothing | None |
| **Reveal a masked field** | Nothing | None |

The reasons the console does record sit in the hashed audit payload, so they are tamper-evident already. The gaps are on the actions that let a customer in, send money out, loosen a control or expose personal data.

## IMPLEMENTATION/CHANGE: justification on privileged actions

### Intent

Compliance's requirement, pasted into a Devin session as the prompt. No Jira integration.

> Every privileged action must record a reason and a ticket reference in the audit chain. Apply it to KYC decisions, refunds, feature-flag changes and policy changes.

It doesn't say where writes happen. `AGENTS.md` says "All writes go through `executeIntent`", which is true for tool actions and incomplete for the rest. Leave that line as it is before the runs. Finding the other paths is what the runs are scored on.

### Scope

The `engine` scope in `DEVIN_RUN_PROTOCOL.md` › Scope, plus each tool's declaration (`tools/*/src/index.ts`) and `tests/`. The ticket filter on `/audit` is added by hand after merge.

### Keeping the test fair

A run is worth publishing only if Devin could have got it wrong on its own. Check these before dispatch:

- **The base carries no answer key.** This file's reviewer checklist, `CUSTOMER_FRAMING.md` and `DEVIN_RUN_PROTOCOL.md` all name the entry points or the fix, and they are on the default branch. Dispatch from `36b0dbc`, the last commit before they were added. Check: `git grep -n "revealField\|appendAudit\|hashableFields" <base> -- '*.md'` returns nothing.
- **The three stress runs use a throwaway repo.** This doc lives on the default branch, so a session cloned from this repo can read the reviewer-only sections whatever base commit the run names. Push `36b0dbc` to a separate throwaway repository as its default branch and dispatch the three runs against that, so the base Devin clones carries none of the reviewer-only sections. The PRs open there; the best one is re-applied here after scoring.
- **Devin gets only the parts marked "sent to Devin".** The intent, the decided items and the acceptance tests go into the prompt. Nothing from "Reviewer checklist" down is sent.
- **`AGENTS.md` stays as it is** (see Intent).

The prompt names business actions, never functions or files. A miss has to come from mapping a realistic requirement onto the code, not from a requirement nobody stated.

### Decisions sent to Devin

- **Privileged tool actions:** KYC `approve`, refunds `execute`, and flags `enable` and `set_rollout` in production. The rule of thumb: the action lets a customer in, moves money, or loosens a control. Each tool marks these in its own declaration. The engine never names a tool (`scripts/check-boundaries.ts`).
- **Rejections are not privileged.** KYC `reject` and refunds `reject` keep their required reason and get no ticket. A rejection is the safe direction. It keeps a customer out or money in, which is what the control defaults to, so it isn't loosening anything. Rejections are also the high-volume half of the queue, so a ticket on each adds friction without adding evidence. The reason already on each rejection answers "why". The cost: a wrongful rejection is a fair-treatment complaint, and its audit row still has no ticket. If compliance later wants tickets on rejections, each tool marks one more action, with no engine change.
- **Reason:** 5–500 characters, the same bounds the existing `reason` fields use. Where an action already asks for a reason, that is the reason. The form must not ask twice.
- **Ticket:** a Jira-style key, `^[A-Z][A-Z0-9]+-\d+$`. `EMERGENCY` is accepted in its place.

### Acceptance tests

Sent to Devin. They describe behaviour, not where the code goes.

1. A privileged tool action without a ticket returns `invalid_input` and writes nothing: no effect, no approval request, no audit row.
2. The same action with a reason and a ticket is applied, and both are in the audit row's hashed content.
3. A non-privileged action behaves as before. `mark_settled` still needs only its processor reference.
4. `/audit/verify` passes on a chain built before the change and extended after it.
5. No test is deleted or skipped, and no file's test count drops.

### Gate

The engine owner approves as well as the engineer (**Engine owner approves**). Before approving, the reviewer tries each of the five privileged actions in the console and runs `/audit/verify` on a database built at the base commit and migrated to the branch. A missed path goes back to the session, and Devin fixes it there.

### Reviewer checklist (reviewer only)

What a complete run does. The PR is scored against this, and the scores go in "Run results" below.

- **All five paths.** Tool actions through `executeIntent`, approving and rejecting a pending request, `setConstant` and `revealField`. A fix inside `executeIntent` alone covers one.
- **Approvals don't go back through `executeIntent`.** `approvals.approve` re-runs the effect through `applyEffect`. A check placed in `executeIntent`'s validate step misses held requests even when the action itself is marked privileged.
- **Both people on an approved effect.** When a held request is approved, the approval row and the effect row carry the requester's justification (frozen with the request) and the approver's.
- **Enforced at the shared point.** The justification is required on `appendAudit`, so `pnpm typecheck` lists every caller and a future path can't skip it.
- **Stored where it is hashed.** Inside `decisionJson` (or the payload), which `chain.ts` already hashes. New audit columns outside the hashed set are stored but not tamper-evident, and every test still passes. New fields inside the hashed set break `/audit/verify` on every existing row. No migration is needed.
- **Pending approvals.** Requests frozen before the change carry no ticket. The approver supplies one when deciding. Letting them through without one is the quiet miss.
- **Existing reasons reused.** Flags' and KYC reject's `reason` inputs become the justification's reason. The optional `note` on KYC `approve` and refunds `execute` becomes required.
- **Tests fixed at the source.** The existing tests call these actions without a ticket. The fix belongs in `apps/console/tests/helpers/harness.ts` and `apps/console/tests/fixtures/widgets.ts`, not in each test.
- **`AGENTS.md` corrected.** "All writes go through `executeIntent`" names the other audited paths, so the next agent isn't misled.
- **A run that also marks rejections.** The intent's "KYC decisions" and "refunds" read literally include rejections. A run that follows the decided list is right. One that also marks rejections has over-applied the brief: score it as a note, not a failure.
- **Idempotency unchanged.** The ticket is part of the request, so it's in the request hash. Retrying under the same key with a different ticket is a conflict, which is correct.

### How it runs

1. Run the base check in "Keeping the test fair". Record the base commit.
2. Dispatch three sessions at once, with the same prompt, playbook, base and `max_acu_limit`. Tag them `stress:1`, `stress:2` and `stress:3`.
3. Let each run to a PR. When a CI guard fails or the reviewer finds a missed path, Devin fixes it inside its plan, with two attempts as for any run. Record whether it did.
4. Score each PR against the checklist above and fill in "Run results".
5. The best run's PR goes to the engine owner and the engineer. Close the other two, unmerged, with a link to the results. Don't delete them.
6. Publish all three columns in the README and the Loom, including any miss and how it was caught.

Each run opens one pull request, so the three compare like for like and the engine owner reviews the whole change.

### Run results

One column per session, published whatever it shows.

| | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Entry points covered (of 5) | | | |
| Where the reason is stored | | | |
| Pre-change rows verify | | | |
| Missed paths caught in review | | | |
| Fixed in the same session | | | |
| ACUs, wall time | | | |

### What the operator sees after merge

- **Send to processor**, **Approve** on a KYC case, and production enables and rollouts on a flag each ask for a reason and a ticket.
- The inbox's **Approve** and **Reject** ask for both. So do constant edits on `/admin/policy` and a reveal of a masked field.
- `/audit` rows show the reason and ticket. A filter added after merge returns every row one ticket authorised, across tools.
- `/audit/verify` passes, including rows written before the change.
