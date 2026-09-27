# KYC Case File

## Summary

- A KYC case opens as a case file: who the customer is, what was checked, where the customer's declaration and the checks disagree, what happens if you approve, and the history.
- A **Declared vs found** register lists each difference, for example "Directorships: declared none, Companies House shows three active". Each row is marked minor or material.
- Two new approval rules on `approve`, both independent of the risk score: a politically exposed person needs a manager (`pep_approval`), and so does a case with a material difference (`declared_vs_found`).
- Six example cases cover the common shapes of a KYC review. Each has a golden test that pins its policy outcome.
- All of it is declared in `tools/kyc` and rendered in the app. The engine doesn't change. Normal feature work, and `AGENTS.md` applies.

## The problem

A KYC case today is a set of flags: `riskScore`, `sanctionsHit`, `documentsComplete`. The page tells a reviewer what the result was, but not what was checked, against which source, or where the customer's story didn't hold up. An analyst in a UK bank would check these on every case before deciding:

- **Checks and sources.** Sanctions (OFSI, OFAC, UN, EU lists), PEP status, adverse media, the company registry (Companies House in the UK), identity documents. They want each result, the source and when it ran.
- **Declared vs found.** The core KYC question is whether what the customer declared matches what independent sources show. A customer who says "no directorships" and holds three is a bigger concern than a high risk score.
- **Triggers that ignore the score.** Some findings need a senior decision whatever the score. UK rules require senior management approval to onboard a politically exposed person, and a material misstatement is an integrity question, not a risk-score one.

The demo depends on the KYC app looking like the real job. In Demo 1 the viewer opens `kyc_0013` to see Devin's `linked_refund_hold` rule take effect, and the case file is what makes that page credible.

## What the case file shows

The record view for a KYC case, top to bottom. Existing parts stay where they are, and two new panels come after the customer card.

| Section | What it shows | Status |
|---|---|---|
| Customer | Customer card: name, country, segment, document, risk gauge, SLA. Adds a PEP row beside Sanctions screening and Documents | Exists, one row added |
| Checks | One row per check: what was checked, result, source, when it ran | New |
| Declared vs found | One row per difference: topic, declared, found, source, severity. When there are none it reads "What the customer declared matches the checks." | New |
| Identity document, Case | The existing field grid | Exists |
| If you approve now | The policy trace for the first action the viewer can take | Exists |
| History | The audit timeline | Exists |

### Checks

| Check | Result values | Example source |
|---|---|---|
| Sanctions | Clear · Possible match · Match | UK OFSI consolidated list, OFAC SDN, UN, EU |
| PEP | Clear · Match | PEP screening list |
| Adverse media | Clear · Findings | News search |
| Company registry | Clear · Needs review | Companies House, or the local registry outside the UK |
| Identity document | Verified · Failed · Missing | Document check |

A result reads in plain words ("Possible match on UK OFSI list"). Colour follows the customer card: Clear and Verified are green; Possible match, Findings, Needs review and Missing are amber; Match and Failed are red.

### Declared vs found

| Topic | Declared | Found | Source | Severity |
|---|---|---|---|---|
| Directorships | None | 3 active companies | Companies House | Material |
| Source of funds | Salary | Dividends from two of those companies | Companies House filings | Material |
| Address | Rotterdam | Refund delivered to Utrecht | Refunds | Minor |

Rules for the register:

- **Material** rows hold approval for a manager. **Minor** rows are shown and don't hold anything. The analyst sees every difference, and policy acts only on the ones that matter.
- **No PII in the register.** Values are city-level or categorical, never a full address, email or document number. The register renders for every KYC role without masking.
- A material row is drawn in the approval tone when `declared_vs_found` holds the action, the same way held fields are highlighted today.

## Rules

Both go on `approve`, after `risk_tier_approval` and before `escalated_needs_manager`. Rule order sets trace order, and the first `require_approval` in the trace sets the tier.

| Rule id | Label | Fires when | Effect | Reason shown |
|---|---|---|---|---|
| `pep_approval` | PEP approval | `pep` is true | `require_approval`, manager tier, `rolesFor("kyc", "manager")` | "Politically exposed person: a manager must approve" |
| `declared_vs_found` | Declared vs found | At least one material row | `require_approval`, manager tier, `rolesFor("kyc", "manager")` | Names the count, e.g. "2 material differences between what the customer declared and what the checks found" |

Neither rule denies. Both are reasons for a second person to look. `pep_approval` highlights the `pep` field. `declared_vs_found` highlights the register rows instead of a field.

The count of material rows is read from `kyc_discrepancies` when the case is loaded. It is a query, never a stored number.

## Example cases

The golden tests assert the outcome in the last column. Existing cases keep their current behaviour, and the two new cases take the first ids after the generated range (`kyc_0014` to `kyc_0101`).

| Case | Shape | Case file | Approve as `kyc_reviewer` |
|---|---|---|---|
| `kyc_0001` Helena Vasquez | Standard individual | Five checks clear, no differences | Applied |
| `kyc_0003` Northwind Freight Ltd | Small UK company | Company registry: needs review, two of three owners verified | Manager, by risk score (72) |
| `kyc_0005` Viktor Sandoval | Sanctions | Sanctions: possible match on UK OFSI list. Its note changes from "PEP list" to "sanctions list" | Denied by `no_sanctions_hit` |
| `kyc_0013` Noor El-Amin | Demo 1 case | Minor difference: home in Rotterdam, refund delivered to Utrecht | Applied, until Devin adds `linked_refund_hold` |
| `kyc_0102` (new) | UK politically exposed person | PEP: match, serving local councillor. Risk score 32 | Manager, by `pep_approval` only |
| `kyc_0103` (new) | Material misstatement | Directorships and source of funds, both material, as in the table above. Risk score 45 | Manager, by `declared_vs_found` only |

Constraints:

- `kyc_0013` must keep approving straight through for a reviewer. Demo 1's after-click depends on it.
- Generated cases get checks that agree with their flags: all clear, plus a possible sanctions match where `sanctionsHit` is set. They get no PEP match and no differences, so the new rules touch only the hand-written cases.
- Customer names are invented. Sources are real public registers. Nothing in a seed describes a real person.

## Changes by file

### `tools/kyc/src/schema.ts`

Add `pep` (integer, default 0) to `kyc_cases`. Add two tables keyed on `case_id`:

- `kyc_checks`: `id`, `case_id`, `kind`, `result`, `source`, `detail`, `checked_at`
- `kyc_discrepancies`: `id`, `case_id`, `topic`, `declared`, `found`, `source`, `severity` (`minor` | `material`)

Re-export both from `apps/console/src/schema.ts` and run `pnpm db:generate`.

### `tools/kyc/src/index.ts`

Add the `pep` field ("Politically exposed person", boolean) to `fields` and to the Risk section. Add `pep_approval` and `declared_vs_found` to `approve`, with both `ruleLabels` and a `ruleFields` entry for `pep_approval`. `getCase` adds `materialDifferences` to the case it returns. Export a `caseFile(id)` read that returns the checks and differences for the view.

### `tools/kyc/src/seed.ts`

Seed checks for every case, differences for `kyc_0013` and `kyc_0103`, and the two new cases. Change `kyc_0005`'s note. Seeding stays idempotent.

### `apps/console/src/lib/customer-profile.ts`, `apps/console/src/components/customer-card.tsx`

Read `pep` into `CustomerFacts`, show it as a row beside Sanctions screening and Documents, and add `pep` to `CUSTOMER_CARD_FIELDS` so the field grid doesn't repeat it.

### `apps/console/src/components/kyc-case-file.tsx` (new)

Server component with the Checks and Declared vs found panels, built from `@console/ui` primitives and `Panel`.

### `apps/console/src/components/record-view.tsx`

For KYC, render the case file panels after the customer card, next to where the card is already chosen.

### `apps/console/tests/tools/kyc-case-file.test.ts` (new)

The golden tests for the example cases and the acceptance list below. Leave `kyc.test.ts` alone: the Kestrel run adds its cases there.

## Acceptance

```bash
pnpm verify
pnpm db:setup && pnpm dev
```

- Each example case approves as the table says, and the trace names the rule that holds it.
- A KYC manager can approve the held requests for `kyc_0102` and `kyc_0103` from `/inbox`.
- Approving `kyc_0013` as a reviewer is applied, and the trace holds nothing.
- For every seeded case, the sanctions check agrees with `sanctionsHit` and the PEP check agrees with `pep`.
- No seeded approved case has a PEP match or a material difference.
- The register holds no email, full address or document number.
- `pnpm check:boundaries` passes, and nothing under `packages/engine/` changes.
- `REFUND_CLUSTERING_HOLD.md` still applies as written: `linked_refund_hold` can be appended to `approve`'s rules, and that spec's KYC acceptance tests 7 and 8 still hold.

## On camera

The case file isn't a demo beat of its own. It makes an existing one credible:

- **Demo 1, after the merge.** Open `kyc_0013`. The register already showed a minor address difference, and nothing held it. Now **Approve** needs a KYC manager, and the trace names `linked_refund_hold`. The console had the evidence, and Devin's rule connects it to the refunds pattern.
- **Off camera.** `kyc_0103` answers "what does KYC look like in this console" in one page: three undisclosed directorships, a manager hold, and the reason in plain words.
