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
- `src/engine` must stay tool-agnostic: never reference `kyc`, `refunds`, or `flags` there and never import `@/tools`; the engine resolves declarations through the `ToolRegistry` passed to `configureEngine` (`src/engine/registry.ts`), which `src/app/bootstrap.ts` wires up (enforced by `scripts/check-boundaries.ts`)
- `src/db` never imports `@/tools`; it holds only the engine tables and clients. The migration schema Drizzle reads is `src/tools/schema.ts` (engine tables plus each tool's tables)
- Tools are declared in `src/tools/<tool>/` (`index.ts`, `schema.ts`, `seed.ts`), registered in `src/tools/index.ts` and their tables re-exported from `src/tools/schema.ts`
- Audit rows are hash-chained and appended in the same transaction as the effect; never write audit rows outside the engine

## Testing Guidelines
- Vitest (`vitest.config.ts`), Node environment, tests in `tests/**/*.test.ts`
- Each test file owns its own database; file parallelism is disabled, so do not share state across files
- Use `tests/helpers/harness.ts` and `tests/fixtures/widgets.ts` for engine setup and fixtures; `setupHarness` calls `configureEngine` with the fixture tools layered over the shipped registry
- Add engine tests under `tests/engine/` and tool tests under `tests/tools/`
- Cover new policy rules, approval paths, and idempotency behaviour with tests
- Run `pnpm verify` before committing

## Project Structure
- `src/app` - Next.js routes (inbox, audit, admin/policy, roadmap, `t/[tool]` tool views) and server actions
- `src/components` - App components; `src/components/ui` holds shadcn primitives
- `src/engine` - Governed write path: policy, approvals, idempotency, audit, PII masking
- `src/db` - Engine tables, read client, engine-only write client
- `src/tools` - Tool declarations (kyc, refunds, flags), the tool registry and the aggregate migration schema
- `src/lib` - Shared helpers (formatting, modes, session)
- `drizzle` - Generated SQL migrations and snapshots
- `scripts` - `migrate.ts`, `seed.ts`, `check-boundaries.ts`
- `tests` - Vitest suites, fixtures, helpers
- `data` - Local SQLite database (gitignored)

## Development Workflow
- Branch from `demo-dashboard-devin-integration` (the default branch); there is no `main`
- Open a pull request for review; PR descriptions use the sections Summary, Updates since last revision, Local testing results, Review and Testing Checklist
- Keep `pnpm verify` green before requesting review
- Update `AGENTS.md`/docs when commands, structure, or architecture rules change
