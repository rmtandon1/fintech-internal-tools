# Linting & Code Quality

One command, `pnpm verify`, is the quality gate for people, for Devin and for CI. This page
covers what it runs, how each check is configured, and the rules a change must follow to pass.

## The gate

```bash
pnpm verify
# = pnpm lint && pnpm typecheck && pnpm check:boundaries && pnpm check:run && pnpm test
```

| Step | Command | Config | Fails when |
|---|---|---|---|
| Lint | `eslint` | `eslint.config.mjs` | Any ESLint error |
| Typecheck | `pnpm -r typecheck && tsc -p tsconfig.scripts.json` | `tsconfig.base.json` (`strict: true`) and each package's `tsconfig.json` | Any type error in a package or in `scripts/` |
| Boundaries | `tsx scripts/check-boundaries.ts` | The script itself | The engine names a tool, an import leaves its package, or a package other than the engine depends on the write client |
| Run guard | `tsx scripts/run-guard.ts` | `runs/<run_id>/plan.json` and `context.json` on the branch | A Devin run branch strays from its committed plan |
| Test | `vitest run` in `apps/console` | `apps/console/vitest.config.ts` | Any test fails |

On a branch with no run, the guard prints
`No run on this branch: PASS — no runs/<run_id>/plan.json added since <base>`.

## Lint

`eslint.config.mjs` is a flat config that extends `next/core-web-vitals` and `next/typescript`
through `FlatCompat`, points the Next plugin at `apps/console`, and ignores `node_modules`,
`.next`, `out`, `build` and `next-env.d.ts`. There are no custom rules: a change passes if it
passes Next's recommended set.

```bash
pnpm lint                 # whole repo
pnpm exec eslint tools/refunds/src   # one folder
```

## Typecheck

Every workspace package runs `tsc --noEmit` against its own `tsconfig.json`, which extends
`tsconfig.base.json` (`strict`, `isolatedModules`, `moduleResolution: bundler`). The root
scripts in `scripts/` compile separately through `tsconfig.scripts.json`, with Node types.

pnpm enforces the package graph: a package can import only what its own `package.json` lists.

## Boundaries

`scripts/check-boundaries.ts` covers what pnpm can't:

1. **The engine names no tool.** No word `kyc`, `refunds` or `flags`, in any case, anywhere under
   `packages/engine`, comments included.
   `packages/engine/src/x.ts: engine references tool name "refunds" — the engine must stay generic`
2. **Relative imports stay inside their package.** `../../db-write/src` would skip the manifest.
3. **Only the engine may depend on `@console/db-write`**, so every write goes through
   `executeIntent`.

A new app passes by living in its own folder under `tools/` and one line in
`apps/console/src/registry.ts`.

## Run guard

`scripts/run-guard.ts` holds a Devin run's branch to the plan it committed first. It runs in
`pnpm verify` and as the `guards` job in CI, which posts the report as a PR comment.

| Check | Fails when |
|---|---|
| **Stays in plan** | A changed file isn't in `plan.json` (or under `runs/<run_id>/`), or its operation differs |
| **Plan stays in scope** | A planned path matches none of `context.json`'s `allowed_paths` |
| **Run dir frozen** | The first commit adds anything but `context.json` and `plan.json`, or a later commit touches either |
| **Shared code reported** | Never fails; names the shared paths touched, so the review knows who else must approve |

**Context untouched** is checked by the console at approval, because CI can't read the console's
database. **Humans approve**, **Engine owner approves** and **No live writes** are enforced by
review, CODEOWNERS and the playbook; the report says so in a footer.

```bash
pnpm exec tsx scripts/run-guard.ts --list-checks
pnpm exec tsx scripts/run-guard.ts --base origin/cognition-dashboard-devin-integration --markdown
```

Details: [DEVIN_RUN_PROTOCOL.md](DEVIN_RUN_PROTOCOL.md) § Guard checks.

## Tests

Vitest 5, Node environment, files matching `apps/console/tests/**/*.test.ts`, one file at a time
(`fileParallelism: false`) because the engine is transactional.

`tests/setup.ts` makes every run hermetic:

- Each test file gets its own temporary SQLite database (`DATABASE_PATH`).
- `REPO_ROOT` points at an empty directory, and the Devin variables are deleted, so a developer's
  real `.env` is never read.
- Global `fetch` throws `Live HTTP is disabled under test: <url>`. The Devin and GitHub clients
  take an injected fetch; tests pass scripted ones from `tests/helpers/scripted-clients.ts`.

| Folder | Covers |
|---|---|
| `tests/engine/` | Approvals, the audit log, concurrency, idempotency, masking, policy, migrations |
| `tests/tools/` | Each app's rules and actions, clusters, the KYC case file, Devin runs and the bridge |
| `tests/lib/` | Console helpers: status, dispatch form, role lists, modes, run surface |
| `tests/api/` | The `/api/devin/<runId>` route |
| `tests/scripts/` | The run guard, playbook registration, the courier-outage scenario |

```bash
pnpm test                                   # all
pnpm test:watch                             # watch mode
pnpm --filter @console/app exec vitest run tests/tools/refunds.test.ts
```

## CI/CD

`.github/workflows/verify.yml`, on every pull request and every push to
`cognition-dashboard-devin-integration`, Node 24, pnpm with `--frozen-lockfile`:

- **`verify`**: Lint, Typecheck, Boundaries, Test.
- **`guards`**: the run guard with `--markdown`, posted as one updating PR comment, then fails
  the job if a check failed.

These are the checks the console reads before an engineer can approve a Devin pull request.
There is no deploy job: the console runs from its own checkout and pulls merged code itself
([GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) § Merge sync).

## Rules for every change

Devin's playbook states these, and review holds people to the same:

- Never shrink a test file, or add `.skip`, `.only` or `.todo`.
- Never add `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` or `as unknown as`.
- Never edit a seed beyond the rows a change needs.
- Every behaviour change comes with a test; changing an existing test is how a behaviour change
  is written down, and the reviewer reads it.
- Run `pnpm verify` without filtering before pushing.

Commit messages in this repository use an imperative title of 72 characters or fewer, a blank
line, then three to five plain bullets.
