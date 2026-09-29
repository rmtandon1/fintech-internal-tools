# Companies House Check

## Summary

- KYC analysts check every UK business customer on Companies House by hand, in another tab.
- A manager asks Devin to add the check from the case that needs it. Devin builds a
  Companies House client, records what it finds as the case's company registry check, and adds
  a material row to Declared vs found when the company is dissolved, in liquidation or late
  with its accounts.
- The existing `declared_vs_found` rule then holds approval for a manager. No new rule.
- Allowed paths: `tools/kyc/**`, `.env.example` and tests. Nothing under `packages/`.

## Today

The analyst opens Companies House in a browser, types the registration number, reads the
company's status and filing history, and types a note into the case. The console's
"Company registry" check is filled in by hand.

In Power Apps, a flow that called the Companies House API would need the premium HTTP
connector, licensed for every user who runs it. In practice nobody builds it, and the lookup
stays manual.

## The request

The request box in the handoff panel starts empty, with this sentence from
`tools/automation/src/specs.ts` as a grey suggestion Tab accepts; the requester may type their
own:

> Add a Companies House connector to KYC: a check action on UK business cases that feeds
> Declared vs found, so the existing approval rule holds dissolved, liquidating or overdue
> companies.

The key handling, the failure behaviour, the recorded responses and the off-by-default setting
come from `DEVIN_RUN_PROTOCOL.md` › House rules, not the request.

## Where it starts

`/t/kyc/kyc_0104`, Thornbury Couriers Ltd, registration number 09318842, risk score 34. Its
company registry check reads "Checked by hand: active, directors match", and a reviewer can
approve it on the spot today. The **Ask Devin to add a check** button shows on UK business
cases for a manager or an admin. An Analyst doesn't see it.

What Devin gets: the case id, the company's name and registration number, its country and
status, and today's hand-typed registry check. No contact email, no person's name or document.

## Reviewer checklist

- **Only UK business cases.** Consumer cases and non-UK businesses are untouched.
- **Writes go through `executeIntent`.** The lookup runs from a KYC action, and the check and
  any difference it records are that action's audited effect. Opening a case writes nothing.
- **The key stays on the server.** `COMPANIES_HOUSE_API_KEY` is read server-side, documented in
  `.env.example`, and never logged or sent to the browser.
- **Recorded responses are labelled.** Without the key, results come from committed recorded
  responses and the check says "test data"; no recording invents a seeded company's result.
- **Failure holds, never passes.** A timeout, an error or an unknown number shows "couldn't
  check" and holds approval like a material difference.
- **It reuses what exists.** The check writes to `kyc_checks` and `kyc_discrepancies`, and
  `declared_vs_found` does the holding. A second rule that duplicates it is a finding.
- **Tests cover each outcome:** active, dissolved, in liquidation, accounts overdue, not found,
  and an API error. No test calls the live API.
- **A settings switch.** The check sits behind a KYC rule setting, 0 by default: at 0 no case
  changes, at 1 the check runs. The setting is declared by the KYC tool.

## After merge

1. An admin turns the Companies House setting on in `/admin/policy` (rule settings).
2. As Analyst, open `kyc_0104` and run the Companies House check.
3. The Company registry check reads "Accounts overdue" from Companies House (test data), and
   Declared vs found gains a material row.
4. **Approve** now needs a manager, and the trace names `declared_vs_found`.

Before the merge, the same click approves Thornbury Couriers on the strength of a check typed
by hand at onboarding, and until the setting is on the merge changes nothing.
