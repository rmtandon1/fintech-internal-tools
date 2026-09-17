# buy-v-build-cog-demo

Internal operations console demo. Analyst / manager / admin modes, many tools behind one
terminal, one governed write path:

```
validate → idempotency → policy → approval → effect → audit
```

Tools are declarations plus `decide` and `apply`. The engine does the rest.

## Run it locally

Requires Node 24 and pnpm. Everything runs on localhost against a local SQLite file
(`data/console.db`); there are no external services, keys or network calls.

```bash
pnpm install
pnpm setup      # migrate + seed data/console.db
pnpm dev        # serves http://localhost:3001 and opens a browser
```

`pnpm dev` fails to render until `pnpm setup` has created the database. To start over at
any point, delete the file and re-seed:

```bash
rm -rf data/console.db* && pnpm setup
```

Role switching is a signed cookie (no auth), chosen from the header. Roles are still
enforced server-side: an analyst who posts a manager-only action is rejected by the
engine, not by the UI.

## Where to look

| Route | |
| --- | --- |
| `/` | console home: queue counts, pending approvals, recent audit, chain status, all modes |
| `/t/kyc`, `/t/refunds`, `/t/flags` | the three live tools — filter, sort, page, open a record |
| `/t/<tool>/<id>` | record detail, masked PII, action panel with the live policy outcome |
| `/inbox` | approval inbox (manager / admin) |
| `/audit` | audit stream with filters, policy traces, before/after and hashes |
| `/audit/verify` | walks the hash chain and names the first break |
| `/admin/policy` | runtime policy constants (admin) |
| `/roadmap/<mode>` | the modes not built yet |

## Demo walkthrough

Each flow takes a minute and exercises a different part of the write path.

**Approval, as analyst then manager.** As `analyst`, open `/t/refunds`, pick a large
pending payment and request a refund above the auto-approve threshold. The action panel
shows the policy trace and returns "pending approval" instead of applying. Switch to
`manager`, open `/inbox`, approve it: the frozen payload is executed, the refund settles,
and two audit rows appear. A manager cannot approve their own request — the self-approval
block is in the SQL predicate, not the UI.

**Policy that moves.** As `admin`, open `/admin/policy` and lower
`refunds.manager_approval_usd_minor`. Re-run the same refund as `analyst`: the same input now
takes a different branch, because thresholds are read fresh on every decision.

**Masked PII.** As `analyst`, open any case in `/t/kyc`. The document number renders as
`•••• 1234`. Reveal it: the value is shown and a `pii_revealed` audit row is written.

**Kill switch.** As `analyst`, disable a production flag in `/t/flags` — it applies
immediately. Enabling one, or raising its customer-facing rollout, needs a manager.

**Tamper-evident audit.** Break the chain from outside the engine, then look at
`/audit/verify`:

```bash
pnpm db:tamper                 # rewrites a row's summary  -> row_hash_mismatch
pnpm db:tamper prev_mismatch   # rewrites a row's prev hash
pnpm db:tamper seq_gap         # deletes a row mid-chain
```

The verify page names the break type and the row it starts at. `rm -rf data/console.db* &&
pnpm setup` puts the demo back.

## Scripts

| Script | |
| --- | --- |
| `pnpm setup` | `db:migrate` then `db:seed` |
| `pnpm db:generate` | regenerate migrations from `src/db/schema.ts` |
| `pnpm db:tamper` | corrupt an audit row for the chain-break demo (local only) |
| `pnpm test` | engine and tool tests |
| `pnpm check:boundaries` | engine must not name a tool; tools must not import the write client |
| `pnpm verify` | lint + typecheck + boundaries + tests |
| `pnpm build` | production build |

## Layout

```
src/engine/    execute-intent, policy, approvals, audit, idempotency, pii
src/tools/     tool declarations + registry
src/db/        Drizzle schema, write client (engine only)
src/app/t/     generic list and record routes
tests/         engine tests against a fixture tool
```
