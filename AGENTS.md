# AGENTS.md

Next.js 15 (App Router) + React 19 governed-write-path console backed by SQLite via Drizzle ORM. Package manager is pnpm (see `pnpm-lock.yaml`); do not use npm or yarn.

## Setup Commands
- Install dependencies: `pnpm install`
- Migrate and seed the local database (`apps/console/data/console.db`): `pnpm setup`
- Start development server (port 3001): `pnpm dev`
- Run tests: `pnpm test` (watch mode: `pnpm test:watch`)
- Lint / typecheck: `pnpm lint` / `pnpm typecheck`
- Architecture boundary check: `pnpm check:boundaries`
- Full gate (lint + typecheck + boundaries + tests): `pnpm verify`
- Build for production: `pnpm build`
- Regenerate Drizzle migrations after schema changes: `pnpm db:generate`

## Code Style
- TypeScript with `strict: true` (`tsconfig.base.json`, extended by every package); no `any`, no unchecked casts
- pnpm workspace (`pnpm-workspace.yaml`): `apps/*`, `packages/*`, `tools/*`. Import other packages by name (`@console/engine/types`, `@console/db`, `@console/tool-kyc`) and declare them in the importing package's `package.json`; never reach across packages with `../`
- Inside `apps/console`, `@/*` aliases `apps/console/src/*`; packages use relative imports internally
- React function components only; server components by default, `"use client"` only where needed
- UI primitives live in `packages/ui/src` (shadcn/Radix + Tailwind v4), imported as `@console/ui/<name>`; reuse them before adding new ones
- ESLint via the root `eslint.config.mjs` (`eslint-config-next`); there is no Prettier config, so match surrounding formatting
- Validate inputs with `zod`; generate ids with `ulid`
- Commit messages: short title line plus plain factual bullets, one change per bullet

## Architecture Rules
- All writes go through `executeIntent` (`packages/engine/src/execute-intent.ts`): validate -> idempotency -> policy -> approval -> effect -> audit
- Only `@console/engine` may depend on `@console/db-write`; everything else reads via `@console/db` and writes via intents. pnpm refuses to resolve an undeclared package, and `scripts/check-boundaries.ts` fails any other manifest that lists `db-write`
- `packages/engine` must stay tool-agnostic: never reference `kyc`, `refunds`, or `flags` there, and its `package.json` lists no `tools/*` package; the engine resolves declarations through the `ToolRegistry` passed to `configureEngine` (`packages/engine/src/registry.ts`), which `apps/console/src/app/bootstrap.ts` wires up
- `packages/db*` never depend on tools. The migration schema Drizzle reads is `apps/console/src/schema.ts` (engine tables plus each tool's tables) — the deployment decides which tools exist
- Tools are workspace packages in `tools/<tool>/` (`src/index.ts`, `src/schema.ts`, `src/seed.ts`, `package.json`), registered in `apps/console/src/registry.ts` and their tables re-exported from `apps/console/src/schema.ts`; a tool that depends on another tool declares it in its `package.json`
- The role catalog is `packages/permissions/src/roles.ts`; it may name tools, the engine may not
- Audit rows are hash-chained and appended in the same transaction as the effect; never write audit rows outside the engine
- `.github/CODEOWNERS` gates `packages/engine`, `packages/db*`, `packages/permissions` and the boundary script

## Testing Guidelines
- Vitest (`apps/console/vitest.config.ts`), Node environment, tests in `apps/console/tests/**/*.test.ts`
- Each test file owns its own database; file parallelism is disabled, so do not share state across files
- Use `apps/console/tests/helpers/harness.ts` and `apps/console/tests/fixtures/widgets.ts` for engine setup and fixtures; `setupHarness` calls `configureEngine` with the fixture tools layered over the shipped registry
- Add engine tests under `apps/console/tests/engine/` and tool tests under `apps/console/tests/tools/`
- Cover new policy rules, approval paths, and idempotency behaviour with tests
- Run `pnpm verify` before committing

## Project Structure
- `apps/console` - The Next app: `src/app` routes (inbox, audit, admin/policy, roadmap, `t/[tool]`) and server actions, `src/components` app components, `src/lib` (modes, session), `src/registry.ts`, `src/schema.ts`, `drizzle/` migrations, `scripts/` (migrate, seed, tamper), `tests/`, `data/` (local SQLite, gitignored)
- `packages/engine` - Governed write path: policy, approvals, idempotency, audit, PII masking, registry, actor
- `packages/permissions` - Role catalog
- `packages/ui` - shadcn primitives, `icon`, `policy-trace`, `status-chip`, `format`, `utils`
- `packages/db-core` - SQLite connection and engine tables (`engine-schema`)
- `packages/db` - Read client
- `packages/db-write` - Write handle (`transact`, `writeDb`, `WriteHandle`)
- `tools/{kyc,refunds,flags}` - Tool declarations
- `scripts/check-boundaries.ts` - Cross-package rules pnpm cannot express
- `docs/` - Product specs and run protocol for the demo; `docs/MIGRATION.md` maps old `src/` paths to new ones

## Git Workflow
- Integration branch: `cognition-dashboard-devin-integration`; never commit to it directly. There is no `main`
- Do feature work on short-lived `devin/<slug>` branches cut from the integration branch; use a short, descriptive slug (e.g. `devin/inbox-bulk-approve`)
- Open one PR per change, targeting the integration branch; PR descriptions use the sections Summary, Updates since last revision, Local testing results, Review and Testing Checklist
- Squash-merge; the PR title becomes the commit title. Delete the feature branch after merge
- Commit at meaningful checkpoints: each commit is a coherent step that builds and passes tests; fold small touch-ups into the related commit
- Tests are required: new or changed behaviour ships with tests, and `pnpm verify` must pass before a PR is opened
- CI (`.github/workflows/verify.yml`, job `verify`) runs `pnpm verify` on every PR; branch protection requires it green
- The `demo-start` tag marks the accepted baseline; do not move or delete it
- Update `AGENTS.md`/docs when commands, structure, or architecture rules change
