---
name: testing-governed-console
description: Browser smoke testing for the Meridian governed-write-path console, including demo roles, refunds, approvals, PII, and audit verification.
---

# Local setup
- Use pnpm from the repo root. Run `pnpm db:setup`, then `pnpm dev`; the console listens on http://localhost:3001. Root scripts forward to the workspace app in `apps/console`; the default database is `apps/console/data/console.db` and `DATABASE_PATH` overrides it.
- When switching from a pre-workspace branch, stop any old dev server before starting the workspace app. On Linux check the listening PID with `ss -ltnp` and its cwd with `readlink /proc/<pid>/cwd`.
- Capture dev-server output to a file to check server-action failures after UI testing.
- Do not assume seeding resets existing records. Check initial status before selecting a mutation scenario; preserve any pre-existing local work.
- Switch demo roles with the header's Acting as selector. Roles are domain-specific: Refunds agent, Refunds manager, KYC reviewer, KYC manager, Admin. No external login is needed for local development.

# Useful browser scenarios
- As Admin, check all three lists: `/t/kyc`, `/t/refunds`, `/t/flags`. Other roles have domain-scoped visibility. After shared UI changes, visually check padded buttons, colored status badges, and bordered cards; Tailwind scans `packages/ui/src` via the app's globals.css `@source`.
- `/t/refunds/rfnd_0001` is initially a small EUR refund. As Refunds agent, Send to processor changes Requested to Executing and increments the version.
- `/t/refunds/rfnd_0003` initially requires manager approval under seeded thresholds. Request as Refunds agent, switch to Refunds manager, then use Approvals (`/inbox`) to approve. Pending approval does not itself change the record status.
- `/t/kyc/kyc_0001` has masked PII. KYC manager/Admin can use the eye button titled Reveal (audited). Verify the revealed value and filter `/audit` by `pii_revealed`.
- Admin can edit `/admin/policy`. Check save notification and persistence after refresh, and restore the original threshold.
- Admin's `/audit/verify` recomputes the chain. Check both Status verified and the event count.
- Audit filter names are `applied`, `approval_requested`, `applied_after_approval`, and `approval_granted`; do not assume intent-prefixed names.
- Refund toast summaries use currency codes (`129.00 EUR`), whereas detail fields use localized currency formatting (`€129.00`).

# Devin Secrets Needed
None for local demo-role testing.

# Agent handoff simulation testing
- Without `DEVIN_API_KEY` the console runs in simulation mode: the header's Devin button shows a SIM chip and the Devin window shows a pre-written run. Nothing is dispatched or recorded; `devin_runs` and the audit chain are untouched.
- As Refunds manager, open `/t/refunds`, then the Kestrel Outdoors not-received cluster and Ask Devin for a rule. In simulation mode the handoff panel's Start run reads "Simulate run" and shows the pre-written run in the panel.
- A real dispatch, approval and merge needs `DEVIN_API_KEY` in a gitignored repo-root `.env` (the org resolves from the key). Do not interpret simulated PR links or merge SHAs as real hosted changes.
- Admin can open a REVERSAL handoff from a merged row in `/runs`. Do not start a reversal unless the test requires it.
- A live dispatch writes both SQLite rows and local `runs/<id>` / replay artifacts. Preserve these together while testing approval or reversal; database seeding is not a run reset.
- `pnpm dev` may open a new browser tab. Ensure console/DOM inspection targets that tab, rather than a stale background tab, before starting the recording.
