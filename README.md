# buy-v-build-cog-demo

Internal operations console demo. 

## Setup

Requires Node 24 and pnpm. Everything runs on localhost against a local SQLite file
(`apps/console/data/console.db`); there are no external services, keys or network calls.

```bash
git clone https://github.com/rmtandon1/buy-v-build-cog-demo.git
cd buy-v-build-cog-demo
pnpm install
pnpm setup      # migrate + seed apps/console/data/console.db
pnpm dev        # serves http://localhost:3001 and opens a browser
```

`pnpm dev` fails to render until `pnpm setup` has created the database. To start over at
any point, delete the file and re-seed:

```bash
rm -rf apps/console/data/console.db* && pnpm setup
```

Role switching is a signed cookie (no auth), chosen from the header. Roles are
domain-scoped — `kyc_reviewer`, `kyc_manager`, `refunds_agent`, `refunds_manager` and
`admin` — and still enforced server-side: a refunds agent who posts a kyc action is
rejected by the engine, not by the UI.

## Where to look

| Route | |
| --- | --- |
| `/` | console home: queue counts, pending approvals, recent audit, chain status, all modes |
| `/t/kyc`, `/t/refunds`, `/t/flags` | the three live tools — filter, sort, page, open a record |
| `/t/<tool>/<id>` | record detail, masked PII, action panel with the live policy outcome |
| `/inbox` | approval inbox (managers / admin) |
| `/audit` | audit stream with filters, policy traces, before/after and hashes |
| `/audit/verify` | walks the hash chain and names the first break |
| `/admin/policy` | runtime policy constants (admin) |
| `/roadmap/<mode>` | the modes not built yet |

## Demo walkthrough

Each flow takes a minute and exercises a different part of the write path.

**Approval, as agent then manager.** As `refunds_agent`, open `/t/refunds`, pick a large
pending payment and request a refund above the auto-approve threshold. The action panel
shows the policy trace and returns "pending approval" instead of applying. Switch to
`refunds_manager`, open `/inbox`, approve it: the frozen payload is executed, the refund settles,
and two audit rows appear. A `kyc_manager` cannot decide it — approvals are scoped to
the tool's domain. A manager cannot approve their own request — the self-approval
block is in the SQL predicate, not the UI.

**Policy that moves.** As `admin`, open `/admin/policy` and lower
`refunds.manager_approval_usd_minor`. Re-run the same refund as `refunds_agent`: the same input now
takes a different branch, because thresholds are read fresh on every decision.

**Masked PII.** Open any case in `/t/kyc`. The document number renders as `•••• 1234` for
every role, and the audit detail masks it too. Only a `kyc_manager` or `admin` can reveal it;
doing so shows the value and writes a `pii_revealed` audit row.

**Kill switch.** As any manager (`kyc_manager`, `refunds_manager` or `admin`), disable a
production flag in `/t/flags` — it applies immediately. Enabling one, or raising its
customer-facing rollout, needs another manager's approval.

**Tamper-evident audit.** Break the chain from outside the engine, then look at
`/audit/verify`:

```bash
pnpm db:tamper                 # rewrites a row's summary  -> row_hash_mismatch
pnpm db:tamper prev_mismatch   # rewrites a row's prev hash
pnpm db:tamper seq_gap         # deletes a row mid-chain
```

The verify page names the break type and the row it starts at. `rm -rf apps/console/data/console.db* &&
pnpm setup` puts the demo back.

## Scripts

| Script | |
| --- | --- |
| `pnpm setup` | `db:migrate` then `db:seed` |
| `pnpm db:generate` | regenerate migrations from `apps/console/src/schema.ts` |
| `pnpm db:tamper` | corrupt an audit row for the chain-break demo (local only) |
| `pnpm test` | engine and tool tests |
| `pnpm check:boundaries` | engine must not name a tool; no relative imports across packages; only the engine may depend on `db-write` |
| `pnpm verify` | lint + typecheck + boundaries + tests |
| `pnpm build` | production build |

## Layout

pnpm workspace. Each folder is a package; a package can only import what its
`package.json` lists, so the dependency direction below is enforced by the
package manager (see `docs/MIGRATION.md` for the old `src/` → new path map).

```
apps/console/          the Next app: routes, server actions, tool registry, migrations, tests
tools/{kyc,refunds,flags}/  one tool declaration per package (index, schema, seed)
packages/engine/       executeIntent, policy, approvals, idempotency, audit, pii
packages/permissions/  the role catalog
packages/ui/           shadcn primitives + presentational views
packages/db/           read client
packages/db-write/     write handle — only packages/engine depends on it
packages/db-core/      the SQLite connection + engine tables
```
