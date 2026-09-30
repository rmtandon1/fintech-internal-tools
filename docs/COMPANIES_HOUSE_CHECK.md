# Merchant monitoring (Companies House)

## Summary

- UK rules require ongoing monitoring of approved customers, not a one-time check at
  onboarding.
- Merchants are checked by hand once at onboarding and never again. Wilko Limited
  (00365335), approved in 2021, is now in liquidation under its new registered name
  WL REALISATIONS (2023) LIMITED, and its "not received" refunds are still paid
  straight through.
- A manager or admin asks Devin to build the monitoring: a daily recheck of approved
  UK merchants, and a hold on an insolvent merchant's refunds for a Manager.
- Allowed paths: `tools/kyc/**`, `tools/refunds/**`, `apps/console/src/schema.ts`,
  `apps/console/drizzle/**`, `apps/console/scripts/**`, `apps/console/package.json`,
  `.env.example` and tests. Nothing under `packages/`.

## Today

The analyst opens Companies House in a browser once, at onboarding, types the
registration number, reads the company's status and types a note into the case. From
then on nobody looks again. Wilko's company registry check still reads "Checked by
hand at onboarding: active" — it was true in 2021, and nothing has looked since.

In Power Apps, a daily recheck would need a scheduled flow and the premium HTTP
connector, licensed for every user it runs as. In practice nobody builds it, and the
monitoring stays a policy on paper.

## The request

The request box in the handoff panel starts empty, with this sentence from
`tools/automation/src/specs.ts` as a grey suggestion Tab accepts; the requester may
type their own:

> Recheck approved UK merchants against Companies House every day. When one enters
> administration, liquidation or dissolution, send it and its refunds to a Manager,
> and link each refund to its merchant's case.

The key handling, the failure behaviour, the recorded responses and the
off-by-default setting come from `DEVIN_RUN_PROTOCOL.md` › House rules, not the
request.

## Where it starts

`/t/kyc/kyc_0104`, Wilko Limited, registration number 00365335, risk score 28,
approved in 2021. Its company registry check reads "Checked by hand at onboarding:
active". The **Ask Devin to monitor merchants** button shows on UK business cases
for a KYC manager or an admin. An Analyst doesn't see it.

What Devin gets: the case id, the company's name and registration number, its
country and status, and today's hand-typed registry check. No contact email, no
person's name or document.

## What Devin must discover

- **Refunds only carry a merchant name.** There is no link from a refund to the
  merchant's KYC case; the migration that adds it must backfill existing refunds.
- **Nothing runs on a schedule.** There is no scheduler and no audited system actor;
  the daily recheck and a manager's "Recheck now" both have to write through
  `executeIntent`.
- **Refund rules can't read KYC.** The hold on an insolvent merchant's refunds is a
  new join between two tools, and it needs the case id, not the merchant name.

## Reviewer checklist

- **Approved UK merchants only.** One Companies House lookup per merchant per run;
  consumer and non-UK cases are untouched.
- **Insolvency is material.** Administration, liquidation or dissolution adds a
  material Declared vs found row with the registry's status and current name, and
  flags the case for a Manager; `declared_vs_found` does the holding, with no
  duplicate rule.
- **Its refunds wait for a Manager.** Pending refunds and any new ones leave the
  Analyst's queue, and the trace names the rule, the merchant and its Companies
  House status.
- **Refunds link by id.** A migration adds the KYC case link and backfills existing
  refunds; no name matching when a refund is decided.
- **Both directions show.** A refund links to its merchant's case, and the case lists
  the merchant's refunds (linkedActivity).
- **Idempotent.** An active company changes nothing, and a rerun adds no duplicate
  checks, findings or holds.
- **Failure flags, never passes.** A timeout, an error or an unknown number records
  "couldn't check" and flags the case for a Manager, without holding its refunds.
- **Two audited entry points.** A daily scheduled run and a "Recheck now"
  action both write through `executeIntent` as a system actor, and report the
  result across every merchant checked.
- **The key stays on the server.** `COMPANIES_HOUSE_API_KEY` is read server-side,
  documented in `.env.example`, and never logged or sent to the browser.
- **Recorded responses.** Tests replay recorded responses for active,
  administration, liquidation, dissolved, not found, an error and a timeout, with
  no live call; no recording invents a seeded company's result.
- **Off until someone turns it on.** The recheck sits behind the
  `kyc.merchant_monitoring` switch, off by default; while it is off there are no
  lookups and no holds.

## After merge

1. A manager switches **Merchant monitoring** on in the Rules panel on `/t/kyc`
   and presses **Recheck now** on its card.
2. Expected outcome: "4 UK merchants checked · 1 in liquidation · 5 refunds sent to
   a manager".
3. Wilko's case shows the live status and a Declared vs found row: declared "Wilko
   Limited, active", found "WL REALISATIONS (2023) LIMITED, liquidation". Its five
   refunds are in the Manager queue.
4. Lakeland, Timpson and Screwfix are unchanged.

For the live beat, `COMPANIES_HOUSE_API_KEY` must be in the root `.env`; without it
the recheck replays recorded responses and labels the result "test data".

Before the merge, Wilko's refunds settle straight through on the strength of a
registry check typed by hand in 2021, and until the setting is on the merge changes
nothing.
