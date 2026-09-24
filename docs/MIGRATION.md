# Path map: `src/` → workspace packages

The repo became a pnpm workspace (`apps/*`, `packages/*`, `tools/*`). Every
file under the old `src/`, `tests/`, `scripts/` and `drizzle/` folders moved.
Specs and protocols that cite `src/...` paths should be read through the tables
below. Where a file was split rather than moved, the split is called out.

## Rules that changed with the layout

| Before | After |
| --- | --- |
| `@/engine/...`, `@/db/...`, `@/tools/...`, `@/lib/...` imports | `@console/engine/...`, `@console/db`, `@console/tool-<name>`, `@console/permissions`, `@console/ui/...` (see import map) |
| `@/*` alias covered all of `src/` | `@/*` exists only inside `apps/console` and means `apps/console/src/*` |
| `scripts/check-boundaries.ts` blocked `@/tools` from engine/db and `@/db/write-client` everywhere else | pnpm blocks undeclared packages; the script now checks (1) no tool name in `packages/engine`, (2) no `../` import leaving a package, (3) only `@console/engine` lists `@console/db-write` |
| "Engine untouched" guards over `src/engine/**` | cover `packages/engine/**` (and, for the write path, `packages/db-write/**`, `packages/db-core/**`) |
| Local database `data/console.db` | `apps/console/data/console.db` (relative to the app; `DATABASE_PATH` still overrides) |
| `pnpm dev/build/test/db:*` ran at the root | still run at the root; they forward to `@console/app` (`apps/console`). `pnpm typecheck` runs in every package |
| `tsconfig.json` | `tsconfig.base.json` (root, shared) + one `tsconfig.json` per package |
| `.github/CODEOWNERS` | new; gates `packages/engine`, `packages/db*`, `packages/permissions`, the boundary script |

## Import map

| Old specifier | New specifier |
| --- | --- |
| `@/engine/types` | `@console/engine/types` |
| `@/engine/<path>` | `@console/engine/<path>` (e.g. `@console/engine/approvals`, `@console/engine/policy/constants`) |
| `@/lib/roles` | `@console/permissions` |
| `@/db/client` | `@console/db` |
| `@/db/write-client` | `@console/db-write` (engine only) |
| `@/db/engine-schema` | `@console/db-core/engine-schema` |
| `@/tools/<tool>` / `@/tools/<tool>/schema` | `@console/tool-<tool>` / `@console/tool-<tool>/schema` |
| `@/tools` (registry) | `@/registry` inside the app (`apps/console/src/registry.ts`) |
| `@/tools/schema` (migration schema) | `@/schema` inside the app (`apps/console/src/schema.ts`) |
| `@/components/ui/<name>` | `@console/ui/<name>` |
| `@/components/{icon,policy-trace,status-chip}` | `@console/ui/{icon,policy-trace,status-chip}` |
| `@/lib/format`, `@/lib/utils` | `@console/ui/format`, `@console/ui/utils` |
| `@/app/...`, `@/components/...`, `@/lib/{modes,session}` | unchanged, inside `apps/console` |

## Splits (not one-to-one moves)

| Old | New |
| --- | --- |
| `src/db/client.ts` (`sqlite`, `databasePath`, `db`, `AppDatabase`) | `packages/db-core/src/connection.ts` (`sqlite`, `databasePath`) and `packages/db/src/index.ts` (`db`, `AppDatabase`) |
| `src/db/write-client.ts` (`transact`, `writeDb`) + `WriteHandle` from `src/engine/types` | `packages/db-write/src/index.ts` owns `transact`, `writeDb` **and** `WriteHandle`; `@console/engine/types` re-exports `WriteHandle` |
| `package.json` (single) | root `package.json` (forwarding scripts + lint/typecheck tooling) and one `package.json` per package listing its own dependencies |

## File map

Generated from `git diff -M --name-status`.

| Old path | New path |
| --- | --- |
| `components.json` | `apps/console/components.json` |
| `drizzle.config.ts` | `apps/console/drizzle.config.ts` |
| `drizzle/0000_perpetual_molly_hayes.sql` | `apps/console/drizzle/0000_perpetual_molly_hayes.sql` |
| `drizzle/0001_noisy_guardian.sql` | `apps/console/drizzle/0001_noisy_guardian.sql` |
| `drizzle/0002_real_nuke.sql` | `apps/console/drizzle/0002_real_nuke.sql` |
| `drizzle/0003_small_talkback.sql` | `apps/console/drizzle/0003_small_talkback.sql` |
| `drizzle/0004_expand_roles.sql` | `apps/console/drizzle/0004_expand_roles.sql` |
| `drizzle/meta/0000_snapshot.json` | `apps/console/drizzle/meta/0000_snapshot.json` |
| `drizzle/meta/0001_snapshot.json` | `apps/console/drizzle/meta/0001_snapshot.json` |
| `drizzle/meta/0002_snapshot.json` | `apps/console/drizzle/meta/0002_snapshot.json` |
| `drizzle/meta/0003_snapshot.json` | `apps/console/drizzle/meta/0003_snapshot.json` |
| `drizzle/meta/_journal.json` | `apps/console/drizzle/meta/_journal.json` |
| `postcss.config.mjs` | `apps/console/postcss.config.mjs` |
| `scripts/migrate.ts` | `apps/console/scripts/migrate.ts` |
| `scripts/seed.ts` | `apps/console/scripts/seed.ts` |
| `scripts/tamper.ts` | `apps/console/scripts/tamper.ts` |
| `src/app/actions.ts` | `apps/console/src/app/actions.ts` |
| `src/app/admin/policy/page.tsx` | `apps/console/src/app/admin/policy/page.tsx` |
| `src/app/audit/page.tsx` | `apps/console/src/app/audit/page.tsx` |
| `src/app/audit/verify/page.tsx` | `apps/console/src/app/audit/verify/page.tsx` |
| `src/app/bootstrap.ts` | `apps/console/src/app/bootstrap.ts` |
| `src/app/favicon.ico` | `apps/console/src/app/favicon.ico` |
| `src/app/globals.css` | `apps/console/src/app/globals.css` |
| `src/app/inbox/page.tsx` | `apps/console/src/app/inbox/page.tsx` |
| `src/app/layout.tsx` | `apps/console/src/app/layout.tsx` |
| `src/app/page.tsx` | `apps/console/src/app/page.tsx` |
| `src/app/roadmap/[mode]/page.tsx` | `apps/console/src/app/roadmap/[mode]/page.tsx` |
| `src/app/t/[tool]/[id]/page.tsx` | `apps/console/src/app/t/[tool]/[id]/page.tsx` |
| `src/app/t/[tool]/page.tsx` | `apps/console/src/app/t/[tool]/page.tsx` |
| `src/components/action-panel.tsx` | `apps/console/src/components/action-panel.tsx` |
| `src/components/app-header.tsx` | `apps/console/src/components/app-header.tsx` |
| `src/components/app-sidebar.tsx` | `apps/console/src/components/app-sidebar.tsx` |
| `src/components/approval-card.tsx` | `apps/console/src/components/approval-card.tsx` |
| `src/components/audit-timeline.tsx` | `apps/console/src/components/audit-timeline.tsx` |
| `src/components/constant-editor.tsx` | `apps/console/src/components/constant-editor.tsx` |
| `src/components/icon.tsx` | `packages/ui/src/icon.tsx` |
| `src/components/policy-trace.tsx` | `packages/ui/src/policy-trace.tsx` |
| `src/components/reveal-field.tsx` | `apps/console/src/components/reveal-field.tsx` |
| `src/components/status-chip.tsx` | `packages/ui/src/status-chip.tsx` |
| `src/components/ui/badge.tsx` | `packages/ui/src/badge.tsx` |
| `src/components/ui/button.tsx` | `packages/ui/src/button.tsx` |
| `src/components/ui/card.tsx` | `packages/ui/src/card.tsx` |
| `src/components/ui/dialog.tsx` | `packages/ui/src/dialog.tsx` |
| `src/components/ui/dropdown-menu.tsx` | `packages/ui/src/dropdown-menu.tsx` |
| `src/components/ui/input.tsx` | `packages/ui/src/input.tsx` |
| `src/components/ui/label.tsx` | `packages/ui/src/label.tsx` |
| `src/components/ui/scroll-area.tsx` | `packages/ui/src/scroll-area.tsx` |
| `src/components/ui/select.tsx` | `packages/ui/src/select.tsx` |
| `src/components/ui/separator.tsx` | `packages/ui/src/separator.tsx` |
| `src/components/ui/sheet.tsx` | `packages/ui/src/sheet.tsx` |
| `src/components/ui/skeleton.tsx` | `packages/ui/src/skeleton.tsx` |
| `src/components/ui/sonner.tsx` | `packages/ui/src/sonner.tsx` |
| `src/components/ui/table.tsx` | `packages/ui/src/table.tsx` |
| `src/components/ui/tabs.tsx` | `packages/ui/src/tabs.tsx` |
| `src/components/ui/textarea.tsx` | `packages/ui/src/textarea.tsx` |
| `src/components/ui/tooltip.tsx` | `packages/ui/src/tooltip.tsx` |
| `src/db/client.ts` | `packages/db-core/src/connection.ts` |
| `src/db/engine-schema.ts` | `packages/db-core/src/engine-schema.ts` |
| `src/engine/actor.ts` | `packages/engine/src/actor.ts` |
| `src/engine/approvals/index.ts` | `packages/engine/src/approvals.ts` |
| `src/engine/audit/append.ts` | `packages/engine/src/audit/append.ts` |
| `src/engine/audit/canonical.ts` | `packages/engine/src/audit/canonical.ts` |
| `src/engine/audit/chain.ts` | `packages/engine/src/audit/chain.ts` |
| `src/engine/audit/query.ts` | `packages/engine/src/audit/query.ts` |
| `src/engine/audit/verify.ts` | `packages/engine/src/audit/verify.ts` |
| `src/engine/declare.ts` | `packages/engine/src/declare.ts` |
| `src/engine/execute-intent.ts` | `packages/engine/src/execute-intent.ts` |
| `src/engine/idempotency/index.ts` | `packages/engine/src/idempotency.ts` |
| `src/engine/pii/mask.ts` | `packages/engine/src/pii/mask.ts` |
| `src/engine/pii/reveal.ts` | `packages/engine/src/pii/reveal.ts` |
| `src/engine/policy/constants.ts` | `packages/engine/src/policy/constants.ts` |
| `src/engine/policy/evaluate.ts` | `packages/engine/src/policy/evaluate.ts` |
| `src/engine/policy/preview.ts` | `packages/engine/src/policy/preview.ts` |
| `src/engine/policy/register.ts` | `packages/engine/src/policy/register.ts` |
| `src/engine/policy/set-constant.ts` | `packages/engine/src/policy/set-constant.ts` |
| `src/engine/registry.ts` | `packages/engine/src/registry.ts` |
| `src/engine/types/index.ts` | `packages/engine/src/types.ts` |
| `src/lib/format.ts` | `packages/ui/src/format.ts` |
| `src/lib/modes.ts` | `apps/console/src/lib/modes.ts` |
| `src/lib/roles.ts` | `packages/permissions/src/roles.ts` |
| `src/lib/session.ts` | `apps/console/src/lib/session.ts` |
| `src/lib/utils.ts` | `packages/ui/src/utils.ts` |
| `src/tools/flags/index.ts` | `tools/flags/src/index.ts` |
| `src/tools/flags/schema.ts` | `tools/flags/src/schema.ts` |
| `src/tools/flags/seed.ts` | `tools/flags/src/seed.ts` |
| `src/tools/index.ts` | `apps/console/src/registry.ts` |
| `src/tools/kyc/index.ts` | `tools/kyc/src/index.ts` |
| `src/tools/kyc/schema.ts` | `tools/kyc/src/schema.ts` |
| `src/tools/kyc/seed.ts` | `tools/kyc/src/seed.ts` |
| `src/tools/refunds/index.ts` | `tools/refunds/src/index.ts` |
| `src/tools/refunds/schema.ts` | `tools/refunds/src/schema.ts` |
| `src/tools/refunds/seed.ts` | `tools/refunds/src/seed.ts` |
| `tests/engine/approvals.test.ts` | `apps/console/tests/engine/approvals.test.ts` |
| `tests/engine/audit-chain.test.ts` | `apps/console/tests/engine/audit-chain.test.ts` |
| `tests/engine/concurrency.test.ts` | `apps/console/tests/engine/concurrency.test.ts` |
| `tests/engine/idempotency.test.ts` | `apps/console/tests/engine/idempotency.test.ts` |
| `tests/engine/migration-roles.test.ts` | `apps/console/tests/engine/migration-roles.test.ts` |
| `tests/engine/pii.test.ts` | `apps/console/tests/engine/pii.test.ts` |
| `tests/engine/policy.test.ts` | `apps/console/tests/engine/policy.test.ts` |
| `tests/fixtures/widgets.ts` | `apps/console/tests/fixtures/widgets.ts` |
| `tests/helpers/harness.ts` | `apps/console/tests/helpers/harness.ts` |
| `tests/lib/roles.test.ts` | `apps/console/tests/lib/roles.test.ts` |
| `tests/setup.ts` | `apps/console/tests/setup.ts` |
| `tests/tools/flags.test.ts` | `apps/console/tests/tools/flags.test.ts` |
| `tests/tools/kyc.test.ts` | `apps/console/tests/tools/kyc.test.ts` |
| `tests/tools/refunds.test.ts` | `apps/console/tests/tools/refunds.test.ts` |
| `tsconfig.json` | `tsconfig.base.json` |
| `vitest.config.ts` | `apps/console/vitest.config.ts` |

## New files

| Path | Purpose |
| --- | --- |
| `pnpm-workspace.yaml` (`packages:` block) | declares `apps/*`, `packages/*`, `tools/*` |
| `tsconfig.base.json` | shared compiler options |
| `apps/console/package.json`, `apps/console/tsconfig.json` | the app package; `@/*` alias lives here |
| `packages/*/package.json`, `packages/*/tsconfig.json`, `tools/*/package.json`, `tools/*/tsconfig.json` | one manifest per package; dependencies are the architecture |
| `packages/db-core/src/index.ts` | exports `sqlite`, `databasePath` |
| `packages/db/src/index.ts` | read client `db` |
| `.github/CODEOWNERS` | review gate by folder |
| `docs/MIGRATION.md` | this file |

## Spec references to update

Known local specs that cite old paths (not in this repo): `PAYOUT_RELEASE.md`,
`DEVIN_RUN_PROTOCOL.md` ("Engine untouched" guard → `packages/engine/**`). A
new tool like payouts becomes `tools/payouts/` with its own `package.json`
depending on `@console/engine`, `@console/db`, `@console/permissions` (and any
tool it links to), registered in `apps/console/src/registry.ts` and
`apps/console/src/schema.ts`.
