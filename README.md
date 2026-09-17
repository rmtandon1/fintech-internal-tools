# buy-v-build-cog-demo

A demo-grade internal **operations console** for a fintech: analyst / manager / admin modes,
many operational tools behind one terminal, and a single governed write path that every
action must pass through.

## The one idea

Tools do not write to the database. They declare themselves as data and supply two
functions — `decide` and `apply`. The engine does everything else, in a fixed order:

```
validate → idempotency → policy → approval → effect → audit
```

So every tool gets, for free and identically: server-side role checks, Zod-validated input,
replay-safe idempotency keys, a traced policy decision, manager approval with a frozen
payload, optimistic-concurrency version checks, and a hash-chained audit record written in
the same transaction as the effect.

## Run it

Requires Node 24 and pnpm.

```bash
pnpm install
pnpm setup      # migrate + seed a local SQLite database at data/console.db
pnpm dev
```

Switch between analyst, manager and admin from the header — the demo has no real auth, only
a signed role cookie. Role checks are still enforced server-side, not just hidden in the UI.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Next.js dev server / production build |
| `pnpm setup` | `db:migrate` then `db:seed` |
| `pnpm db:generate` | Regenerate Drizzle migrations from `src/db/schema.ts` |
| `pnpm test` | Engine tests (Vitest, one SQLite file per test file) |
| `pnpm check:boundaries` | Fails if the engine learns a tool's name, or a tool learns to write |
| `pnpm verify` | lint + typecheck + boundaries + tests |

## Layout

```
src/engine/    the governed write path: execute-intent, policy, approvals, audit, idempotency, pii
src/tools/     the tool registry — declarations only
src/db/        Drizzle schema and the write client (engine-only)
src/app/t/     generic list and record routes rendered from declarations
tests/         engine tests against a fixture tool, so they never depend on a shipped tool
```

`scripts/check-boundaries.ts` enforces the two rules that keep this honest: nothing in
`src/engine` may mention a concrete tool, and nothing outside the engine may import the
write client.

## Adding a tool

Write a declaration (fields, PII flags, list columns, filters, statuses, actions, policy
rules, `decide`, `apply`, `list`, `get`), register it in `src/tools/index.ts`, and it appears
in the sidebar with working list, record, action, approval, audit and reveal behaviour. No
new routes.
