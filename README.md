# buy-v-build-cog-demo

Internal operations console demo. Analyst / manager / admin modes, many tools behind one
terminal, one governed write path:

```
validate → idempotency → policy → approval → effect → audit
```

Tools are declarations plus `decide` and `apply`. The engine does the rest.

## Run

Node 24, pnpm.

```bash
pnpm install
pnpm setup      # migrate + seed data/console.db
pnpm dev
```

Role switching is a signed cookie (no auth). Roles are still enforced server-side.

## Scripts

| Script | |
| --- | --- |
| `pnpm setup` | `db:migrate` then `db:seed` |
| `pnpm db:generate` | regenerate migrations from `src/db/schema.ts` |
| `pnpm test` | engine tests |
| `pnpm check:boundaries` | engine must not name a tool; tools must not import the write client |
| `pnpm verify` | lint + typecheck + boundaries + tests |

## Layout

```
src/engine/    execute-intent, policy, approvals, audit, idempotency, pii
src/tools/     tool declarations + registry
src/db/        Drizzle schema, write client (engine only)
src/app/t/     generic list and record routes
tests/         engine tests against a fixture tool
```

README is a stub — to be filled in later.
