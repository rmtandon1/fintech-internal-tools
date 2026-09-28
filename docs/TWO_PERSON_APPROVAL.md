# Two-Person Approval

The reviewer's brief for Demo 2. This is an engine-scope run, so Devin's prompt names this file,
and Devin reads only the section marked as sent to Devin (`.devin/run-protocol.playbook.md`
§ Intake). Everything else here is for the reviewer; the checklist is also in the approval dialog.

## Summary

- Today one admin can release any refund, however large. A refund at or above the $5,000 admin
  limit waits for exactly one approver.
- An admin asks Devin, from a large refund, for two different approvers on those refunds,
  neither of them the person who asked.
- It changes how approvals work for every app, so it runs in engine scope: only an admin can
  ask, and the engine's owner reviews it as well as an engineer.
- On screen it's the role model in action: who can ask, who can approve, and who can't approve
  twice.

## Today

In the Power App, a large refund starts a Power Automate "Start and wait for an approval" sent
to an approver group. The first person to respond decides, and nothing stops the requester
being in the group. The flow's other option, "Everyone must approve", means every person
listed. "Any two, but not the person who asked" needs custom logic nobody maintains.

In the console, `amount_approval` sends a refund at or above `refunds.admin_approval_usd_minor`
($5,000) to the admin tier. One admin approves it, and the requester can't
(`packages/engine/src/approvals.ts`, maker isn't checker).

## The request (sent to Devin)

Prefilled from `tools/automation/src/specs.ts`, and editable. The second sentence is the design
engineering agreed before asking: policy and data-model decisions Devin shouldn't guess.

> Refunds at or above the admin limit need two different approvers, each a refunds manager or
> an admin, before they reach the processor, and the person who asked can't be one of them.
> Agreed with engineering: an approval request records each approver and applies once enough
> have approved; nobody approves the same request twice; requests already waiting still need
> one. Show 1 of 2 in the inbox.

## Where it starts

`/t/refunds/rfnd_0015`, Meridian Air Charters, $8,400. The **Ask Devin for a second approver**
button shows on refunds at or above the admin limit. An admin can press it. A refunds manager
sees it greyed out: "Only an admin can ask for this". A refunds agent doesn't see it.

What Devin gets: the refund's id, merchant, reason, amount and status, and the two approval
limits. No customer email or card.

## Reviewer checklist

- **One engine change, not one per app.** The approval request carries how many approvals it
  needs (default 1) and a record of each approver. Any tool's rule can ask for two.
- **Each approval is its own audit row**, and the effect applies in the same transaction as the
  last one, as today.
- **Nobody approves twice, and the requester never approves.** Enforced where approvals are
  decided, not in the inbox's buttons.
- **Waiting requests keep their rules.** A request created before the change still needs one
  approval. Changing it silently is a finding.
- **The migration is additive.** Existing approval rows keep working, and `/audit/verify` passes
  on a chain written before the change.
- **The inbox shows progress**: "1 of 2", and who has approved.
- **Tests:** two different approvers apply it; the same approver twice is denied; the requester
  is denied; a KYC manager is denied (domain); an old pending request applies on one approval.

## After merge

1. As refunds agent, send `rfnd_0015` to the processor. It waits: "0 of 2 approvals".
2. As refunds manager, approve it in `/inbox`: "1 of 2". Approve again: denied, already
   approved.
3. As KYC manager, it isn't in the inbox at all.
4. As admin, approve it: the refund goes to the processor. Two approval rows and the effect row
   are in `/audit`.

Before the merge, `rfnd_0004` ($14,500) goes through on one admin's approval.
