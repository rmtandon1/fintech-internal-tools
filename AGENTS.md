# AGENTS.md

Next.js 15 (App Router) + React 19 governed-write-path console backed by SQLite via Drizzle ORM. Package manager is pnpm (see `pnpm-lock.yaml`); do not use npm or yarn.

## Setup Commands
- Install dependencies: `pnpm install`
- Migrate and seed the local database (`data/console.db`): `pnpm setup`
- Start development server (port 3001): `pnpm dev`
- Run tests: `pnpm test` (watch mode: `pnpm test:watch`)
- Lint / typecheck: `pnpm lint` / `pnpm typecheck`
- Architecture boundary check: `pnpm check:boundaries`
- Full gate (lint + typecheck + boundaries + tests): `pnpm verify`
- Build for production: `pnpm build`
- Regenerate Drizzle migrations after schema changes: `pnpm db:generate`

## Code Style
- TypeScript with `strict: true` (`tsconfig.json`); no `any`, no unchecked casts
- Import from `src/` via the `@/*` path alias
- React function components only; server components by default, `"use client"` only where needed
- UI primitives live in `src/components/ui` (shadcn/Radix + Tailwind v4); reuse them before adding new ones
- ESLint via `eslint.config.mjs` (`eslint-config-next`); there is no Prettier config, so match surrounding formatting
- Validate inputs with `zod`; generate ids with `ulid`
- Commit messages: short title line plus plain factual bullets, one change per bullet

## Architecture Rules
- All writes go through `executeIntent` (`src/engine/execute-intent.ts`): validate -> idempotency -> policy -> approval -> effect -> audit
- Only `src/engine` and `src/db` may import `@/db/write-client`; everything else reads via `@/db/client` and writes via intents
- `src/engine` must stay tool-agnostic: never reference `kyc`, `refunds`, or `flags` there (enforced by `scripts/check-boundaries.ts`)
- Tools are declared in `src/tools/<tool>/` (`index.ts`, `schema.ts`, `seed.ts`) and registered in `src/tools/index.ts`
- Audit rows are hash-chained and appended in the same transaction as the effect; never write audit rows outside the engine

## Testing Guidelines
- Vitest (`vitest.config.ts`), Node environment, tests in `tests/**/*.test.ts`
- Each test file owns its own database; file parallelism is disabled, so do not share state across files
- Use `tests/helpers/harness.ts` and `tests/fixtures/widgets.ts` for engine setup and fixtures
- Add engine tests under `tests/engine/` and tool tests under `tests/tools/`
- Cover new policy rules, approval paths, and idempotency behaviour with tests
- Run `pnpm verify` before committing

## Project Structure
- `src/app` - Next.js routes (inbox, audit, admin/policy, roadmap, `t/[tool]` tool views) and server actions
- `src/components` - App components; `src/components/ui` holds shadcn primitives
- `src/engine` - Governed write path: policy, approvals, idempotency, audit, PII masking
- `src/db` - Drizzle schema, read client, engine-only write client
- `src/tools` - Tool declarations (kyc, refunds, flags)
- `src/lib` - Shared helpers (formatting, modes, session)
- `drizzle` - Generated SQL migrations and snapshots
- `scripts` - `migrate.ts`, `seed.ts`, `check-boundaries.ts`
- `tests` - Vitest suites, fixtures, helpers
- `data` - Local SQLite database (gitignored)

## Development Workflow
- Integration branch: `cognition-dashboard-devin-integration`; there is no `main`, and nothing is committed to it directly
- Do feature work on short-lived `devin/<slug>` branches cut from the integration branch; use a short, descriptive slug (e.g. `devin/inbox-bulk-approve`)
- Open one PR per change, targeting the integration branch; delete the feature branch after merge
- PR descriptions use the sections Summary, Updates since last revision, Local testing results, Review and Testing Checklist
- Commit at meaningful checkpoints: each commit is a coherent step that builds and passes tests; fold small touch-ups into the related commit
- Tests are required: new or changed behaviour ships with tests, and `pnpm verify` must pass before a PR is opened
- Update `AGENTS.md`/docs when commands, structure, or architecture rules change
