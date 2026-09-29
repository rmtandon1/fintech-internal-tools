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

Prefilled in the handoff panel from `tools/automation/src/specs.ts`, and editable:

> Add a Companies House check to UK business cases. Look the company up by its registration
> number. If it is dissolved, in liquidation or late with its accounts, add that to Declared vs
> found as material, so a manager has to approve. Read the Companies House API docs on the web
> first. Without COMPANIES_HOUSE_API_KEY, use recorded responses and label the result as test
> data; record 09318842 as late with its accounts. Put the check behind a setting
> `kyc.companies_house_check` in rule settings, off by default, so an admin turns it on after
> the merge; when off, cases are unchanged.

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
  responses and the check says "test data". The recorded 09318842 is late with its accounts.
- **Failure holds, never passes.** A timeout, an error or an unknown number shows "couldn't
  check" and holds approval like a material difference.
- **It reuses what exists.** The check writes to `kyc_checks` and `kyc_discrepancies`, and
  `declared_vs_found` does the holding. A second rule that duplicates it is a finding.
- **Tests cover each outcome:** active, dissolved, in liquidation, accounts overdue, not found,
  and an API error. No test calls the live API.
- **A settings switch.** With `kyc.companies_house_check` off (the default) no case changes; on,
  the check runs. The setting is declared by the KYC tool.

## After merge

1. An admin turns `kyc.companies_house_check` on in `/admin/policy` (rule settings).
2. As Analyst, open `kyc_0104` and run the Companies House check.
3. The Company registry check reads "Accounts overdue" from Companies House (test data), and
   Declared vs found gains a material row.
4. **Approve** now needs a manager, and the trace names `declared_vs_found`.

Before the merge, the same click approves Thornbury Couriers on the strength of a check typed
by hand at onboarding, and until the setting is on the merge changes nothing.
