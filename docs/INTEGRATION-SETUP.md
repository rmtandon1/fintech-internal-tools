# Integration Setup: Operational Runbook

Verification runbook for developers and agents resuming work on this repo. For a quick start, see [SETUP.md](SETUP.md).

---

## Architecture Overview

Browser → Console (Next.js, `:3001`) → Engine (SQLite) · Console server → Devin v3 API →
GitHub pull request → CI (`verify`, `guards`) → engineer approval in the console → Devin merge →
merge sync (`git pull --ff-only` + `pnpm db:migrate` + setting registration) → Console.

## Rules that will bite you

1. **The checkout that runs `pnpm dev` is the console's deployment.** It must sit on
   `cognition-dashboard-devin-integration` with a clean working tree, or the merge sync skips
   and merged runs never reach the screen. Don't edit files in the serving checkout; do feature
   and docs work in a `git worktree`.
2. **GitHub is the source of truth for code.** The console never pushes. Devin opens pull
   requests; Devin merges after the console's approval; the console only pulls.
3. **The live database is the source of truth for settings.** `runtime_constants` in
   `apps/console/data/console.db` holds what every decision reads. The `value:` in a tool's
   code is a default that `registerConstants` writes only when the key is missing.
4. **Devin never touches the live database.** It works from `runs/<run_id>/context.json`, a
   snapshot without customer data. `pnpm db:setup`, `db:seed` and `db:scenario` are for people,
   not Devin sessions. Don't run `pnpm db:setup` on a database with runs you care about: it
   re-seeds.
5. **Credentials and local state stay out of git.** `.env` at the repo root is read by the Next
   server only; the browser only ever calls `/api/devin/*` and server actions. Don't commit
   `.env`, `apps/console/data/` or anything under `apps/console/data/replays/`.
6. **Committed run files are frozen.** Hand-editing `runs/<run_id>/context.json` or `plan.json`
   once committed fails the guard with **Run dir frozen**, and approval with **Context untouched**.
7. **Spec filenames are load-bearing.** `tools/automation/src/specs.ts` and the Devin prompt refer
   to `REFUND_CLUSTERING_HOLD.md`, `COMPANIES_HOUSE_CHECK.md` and `CHARGEBACKS_FROM_POWER_APPS.md`
   by name under `docs/`; don't rename them.
8. **`packages/engine` never names a tool.** No `kyc`, `refunds` or `flags`, even in a comment.

---

## File Structure & What Serves From Where

```
<repo root>                               ← serving checkout: on the integration branch, clean
├── .env                                  ← DEVIN_API_KEY, GITHUB_TOKEN (gitignored, server-only)
├── .env.example                          ← template; the only env file in git
├── .devin/run-protocol.playbook.md       ← body of the "Governed console run" playbook
├── .github/
│   ├── CODEOWNERS                        ← engine owner on packages/, drizzle/, runs/, scripts
│   └── workflows/verify.yml              ← CI: `verify` job + `guards` job (PR comment)
├── apps/console/                         ← Next.js app served on :3001
│   ├── data/console.db                   ← LIVE database (gitignored): records, settings, runs, audit
│   ├── data/runs/<id>/context.json       ← copy of each dispatched context, for undo
│   ├── data/replays/<id>.json            ← local recording of live polls (gitignored)
│   ├── drizzle/                          ← migrations; merge sync applies new ones
│   ├── src/app/api/devin/                ← /api/devin/status, /api/devin/<runId> (server-side proxy)
│   ├── src/lib/bridge.ts                 ← reads .env, builds Devin/GitHub/git clients
│   ├── src/registry.ts                   ← the list of live tools
│   └── tests/                            ← Vitest suite run by `pnpm test`
├── docs/                                 ← documentation; feature specs Devin must not open
├── fixtures/power-apps/chargebacks/      ← the Power Apps export Part 3 starts from
├── packages/engine/                      ← the governed write: policy, approvals, audit
├── runs/<run_id>/                        ← frozen context.json + plan.json per merged run
├── scripts/
│   ├── check-boundaries.ts               ← `pnpm check:boundaries`
│   ├── run-guard.ts                      ← `pnpm check:run`, CI `guards` job
│   └── register-playbook.ts              ← `pnpm devin:playbook`
└── tools/
    ├── automation/src/                   ← Devin runs: specs, bridge, API clients, merge sync
    ├── kyc/ refunds/ flags/              ← the three live apps
```

---

## Complete Setup Verification Checklist

Run each step from the repo root.

### 1. Node and pnpm

```bash
node -v && pnpm -v
```

Expected:

```
v24.21.0
10.34.5
```

**If Node is not 24:** install Node 24 (`nvm install 24 && nvm use 24`). CI uses Node 24.

### 2. Branch and working tree

```bash
git rev-parse --abbrev-ref HEAD && git status --porcelain | wc -l
```

Expected:

```
cognition-dashboard-devin-integration
       0
```

**If the branch differs:** `git switch cognition-dashboard-devin-integration`.
**If the count is not 0:** move the work into a worktree (see Common Issues 2). An untracked
`runs/<id>/context.json` for a run that later merged is the one allowed exception; the sync
deletes it. Delete `runs/<id>/` folders left by stopped runs, or the sync refuses to pull.

### 3. Remote and freshness

```bash
git remote get-url origin && git fetch -q && git rev-list --count HEAD..origin/cognition-dashboard-devin-integration
```

Expected:

```
https://github.com/rmtandon1/fintech-internal-tools.git
0
```

**If the count is above 0:** `git pull --ff-only origin cognition-dashboard-devin-integration`.

### 4. Dependencies

```bash
pnpm install --frozen-lockfile
```

Expected last line: `Done in 3.1s using pnpm v10.34.5`

**If the lockfile is out of date:** someone changed a `package.json` without the lockfile.
Pull again; don't run a plain `pnpm install` on the serving checkout.

### 5. Environment file

```bash
test -f .env && sed 's/=.*/=<set>/' .env | grep -v '^#' | grep .
```

Expected:

```
DEVIN_API_KEY=<set>
GITHUB_TOKEN=<set>
```

`DEVIN_ORG_ID=<set>` may also appear; it is optional.
**If nothing prints:** `cp .env.example .env` and fill in the keys.

### 6. Database and migrations

```bash
sqlite3 apps/console/data/console.db "select count(*) from __drizzle_migrations;" \
  && node -e 'console.log(require("./apps/console/drizzle/meta/_journal.json").entries.length)'
```

Expected: two equal numbers, for example:

```
9
9
```

**If the file is missing:** `pnpm db:setup`.
**If the first number is lower:** `pnpm db:migrate`.

### 7. Live settings

```bash
sqlite3 apps/console/data/console.db "select key, value_json from runtime_constants order by key;"
```

Expected (fresh seed):

```
flags.permission_flag_needs_admin|true
flags.production_change_needs_manager|true
flags.rollout_step_needs_manager_percent|25
kyc.companies_house_check|0
kyc.manager_review_score|70
kyc.prohibited_countries|["IR","KP","SY","CU"]
refunds.goodwill_approval_usd_minor|5000
refunds.manager_approval_usd_minor|50000
```

**If a value differs:** an admin changed it on `/admin/policy`; the audit log says who. That is
not an error. A key missing entirely means the server hasn't started since the tool declared
it; start `pnpm dev`.

### 8. Console server

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN | tail -n +2 | awk '{print $1, $2}'; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/
```

Expected:

```
node 12345
200
```

**If nothing listens:** `pnpm dev`.

### 9. Devin connection

```bash
curl -s http://localhost:3001/api/devin/status
```

Expected:

```json
{"github":true,"configured":true,"mode":"live","orgId":"org-…","orgSource":"DEVIN_ORG_ID","principal":"service_user · …","error":null}
```

**If `"mode":"simulation"`:** the key is missing or the server started before `.env` changed.
Restart `pnpm dev`.
**If `error` is set:** see [DEVIN_API_SETUP.md](DEVIN_API_SETUP.md) § Common Issues.

### 10. Run playbook

```bash
pnpm devin:playbook
```

Expected: a playbook id on the last line, for example `playbook-…`. Re-running updates
the same playbook.

**If it prints `Set DEVIN_API_KEY in .env before registering the playbook`:** fix step 5.
**If `Multiple org playbooks named Governed console run`:** delete the duplicates in Devin.

### 11. GitHub token

```bash
set -a; . ./.env; set +a
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/rmtandon1/fintech-internal-tools \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.full_name, j.permissions && j.permissions.push)})'
```

Expected: `rmtandon1/fintech-internal-tools true`

**If `undefined`:** the token can't see the repository. **If `false`:** it can read but can't
review; **Review and approve** will fail at the GitHub step. See
[GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md).

### 12. CI and branch protection

```bash
gh run list --branch cognition-dashboard-devin-integration --limit 1
gh api repos/rmtandon1/fintech-internal-tools/branches/cognition-dashboard-devin-integration/protection --jq '.required_status_checks.contexts' 2>&1 | head -1
```

Expected:

```
completed	success	…	verify	cognition-dashboard-devin-integration	push	…
["verify","guards"]
```

**If `Branch not protected`:** that is the state on 2026-09-28. The console's approval still
gates Devin's merge, but GitHub doesn't. Turning protection on is in
[GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md) § Branch protection.

### 13. Full gate

```bash
pnpm verify
```

Expected (last lines):

```
Boundary check passed.
No run on this branch: PASS — no runs/<run_id>/plan.json added since <base>
 Test Files  39 passed (39)
      Tests  325 passed (325)
```

**If anything fails:** fix it before dispatching a run. Devin's Baseline phase stops on the
same failure.

---

## Complete Integration Flow

### Edit → reload (local development)

```
Edit in a worktree (never the serving checkout)
  └─→ pnpm verify in the worktree
        └─→ push a branch, open a PR against cognition-dashboard-devin-integration
              └─→ CI: verify + guards
                    └─→ merge on GitHub
                          └─→ serving checkout: git pull --ff-only
                                └─→ pnpm dev hot-reloads; pnpm start needs pnpm build first
```

### Automation → PR → merge → pull

```
Operator: Ask Devin … → Send to Devin
  └─→ dispatchRun: write runs/<id>/context.json, dispatch audit row
        └─→ POST /v3/organizations/{org}/attachments, then /sessions
              └─→ record_session (or dispatch_failed)
                    └─→ Devin: intake → baseline → plan commit → edit → verify → PR
                          └─→ console poll sees pr_url → record_pr
                                └─→ engineer: Approve as engineer → approve_pr
                                      └─→ POST /repos/{owner}/{repo}/pulls/{n}/reviews (APPROVE)
                                            └─→ message the session to merge
                                                  └─→ GitHub reports merged → record_merge
                                                        └─→ syncMergedRun: pull --ff-only, pnpm install (if deps changed), db:migrate, settings + app flags
```

### State sync

```
Setting change (/admin/policy)
  └─→ setConstant → runtime_constants row + constant_changed audit row
        └─→ next decision calls loadConstants() and reads the new value

Missed merge (nobody had the run open)
  └─→ /runs → Sync with GitHub (engineer)
        └─→ reconcileRuns: read every approved run's PR
              └─→ record_merge for each merged one
                    └─→ one pull for the newest merge
```

---

## Common Issues & Solutions

### 1. A merged run doesn't change the console

**Symptoms:** the run reads **Live** or **Approved**, the PR is merged, but the next record
still follows the old rules.

**Diagnosis:**

```bash
git rev-parse --abbrev-ref HEAD
git status --porcelain
git log -1 --format=%H
sqlite3 apps/console/data/console.db "select id, status, merge_commit from devin_runs order by requested_at desc limit 3;"
```

**Solutions:**

1. If the branch is wrong: `git switch cognition-dashboard-devin-integration`, then **Pull merged
   code** on the run.
2. If the tree is dirty: move the changes out (see issue 2), then **Pull merged code**.
3. If the run is still **Approved**: `/runs` → **Sync with GitHub** as `engineer`.
4. If you serve with `pnpm start`: `pnpm build` and restart.

### 2. Work was done in the serving checkout

**Symptoms:** `git status` shows changes in the checkout that runs `:3001`; merge sync reports
`working tree has uncommitted changes`.

**Diagnosis:**

```bash
git status --short
```

**Solutions:**

1. Move the changes to a branch in a worktree:
   ```bash
   git stash -u
   git worktree add ../work-fix -b fix/my-change origin/cognition-dashboard-devin-integration
   cd ../work-fix && git stash pop
   ```
2. Leave an untracked `runs/<id>/context.json` alone if a dispatch wrote it; the sync deletes it
   when it matches the merged run.

### 3. Devin not connected

**Symptoms:** the Devin window says `Devin not connected`; status shows `"mode":"simulation"`.

**Diagnosis:**

```bash
grep -c '^DEVIN_API_KEY=cog_' .env
curl -s http://localhost:3001/api/devin/status
```

**Solutions:**

1. Set `DEVIN_API_KEY=cog_…` in the root `.env`, with no quotes.
2. Restart `pnpm dev`.

### 4. A run stops at Verify on a test it didn't plan

**Symptoms:** the run reads **Stopped**; `stopped_by` names a test file such as
`refunds-clusters.test.ts`.

**Diagnosis:**

```bash
pnpm exec tsx scripts/run-guard.ts --base origin/cognition-dashboard-devin-integration
```

**Solutions:**

1. Make sure the org playbook is current: `pnpm devin:playbook`. The plan step must list every
   existing test the change moves (#65).
2. Dispatch again.

### 5. Approval fails at the GitHub step

**Symptoms:** the approval dialog shows the review step failed, for example `GitHub API 403`.

**Diagnosis:** step 11 above.

**Solutions:**

1. Give `GITHUB_TOKEN` pull-request write access to the repository.
2. Retry **Approve as engineer**. The approval is recorded once; the retry re-posts only the
   GitHub review (#64).

### 6. A second run is refused

**Symptoms:** **Send to Devin** is denied with a policy trace naming a run in flight.

**Diagnosis:**

```bash
sqlite3 apps/console/data/console.db "select id, tool, status from devin_runs where status in ('dispatched','running','approved');"
```

**Solutions:**

1. Finish or **Stop run** the one in flight for that tool.
2. If its session already ended, open `/runs`: the next poll records `stop` and frees the tool.

---

## Verification Commands

```bash
# === Toolchain ===
node -v
pnpm -v

# === Git ===
git rev-parse --abbrev-ref HEAD
git status --porcelain
git remote get-url origin
git fetch -q && git rev-list --count HEAD..origin/cognition-dashboard-devin-integration

# === Environment (names only) ===
sed 's/=.*/=<set>/' .env | grep -v '^#' | grep .

# === Database ===
sqlite3 apps/console/data/console.db "select count(*) from __drizzle_migrations;"
sqlite3 apps/console/data/console.db "select key, value_json from runtime_constants order by key;"
sqlite3 apps/console/data/console.db "select id, operation, status, pr_url from devin_runs order by requested_at desc limit 5;"

# === Console ===
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/
curl -s http://localhost:3001/api/devin/status

# === GitHub ===
gh run list --branch cognition-dashboard-devin-integration --limit 3
gh pr list --state open --limit 10

# === Quality gate ===
pnpm verify
```

---

## Important File Locations

**Source files**

- `tools/automation/src/specs.ts:73` `REFUND_CLUSTERING_HOLD`, `:124` `COMPANIES_HOUSE_CHECK`, `:168` `CHARGEBACKS_FROM_POWER_APPS` — runnable specs, allowed paths, prefilled sentences
- `tools/automation/src/bridge.ts:149` `dispatchRun` · `:274` `pollRun` · `:369` `observeRun` · `:408` `approveRun` · `:469` `observeMerge` · `:513` `syncMergedRun` · `:599` `reconcileRuns` · `:639` `stopRun`
- `tools/automation/src/run-files.ts` — `ContextFile`, `PlanFile`, `StructuredOutput` schemas
- `packages/engine/src/policy/constants.ts` — `loadConstants`
- `packages/engine/src/policy/register.ts` — `registerConstants` (skips existing keys)

**Server files**

- `apps/console/src/lib/bridge.ts:65` `bridgeDeps` — reads `DEVIN_API_KEY`, `GITHUB_TOKEN`, `DEVIN_ORG_ID`, `DEVIN_PLAYBOOK_ID`, `SYNC_REMOTE`, `SYNC_BRANCH`
- `apps/console/src/lib/env.ts:16` `loadRepoEnv` — loads the root `.env` once per process
- `apps/console/src/lib/devin-status.ts:47` `devinStatus` — `/api/devin/status` body
- `apps/console/src/app/automation-actions.ts` — server actions: dispatch (`:45`), poll (`:95`), approve (`:127`), merge check (`:154`), sync (`:192`), reconcile (`:219`), stop (`:250`)
- `apps/console/src/instrumentation.ts` — registers tool settings on server start
- `tools/automation/src/devin-api.ts:112` `httpDevinClient` · `tools/automation/src/github-api.ts:86` `httpGitHubClient` · `tools/automation/src/git.ts:14` `SYNC_BRANCH`

**Config**

- `.env.example`, `.devin/run-protocol.playbook.md`, `.github/workflows/verify.yml`,
  `.github/CODEOWNERS`, `eslint.config.mjs`, `apps/console/vitest.config.ts`,
  `pnpm-workspace.yaml`

**Logs and local state**

- `pnpm dev` terminal output — server errors, including `DevinApiError` / `GitHubApiError` text
- `apps/console/data/replays/<run_id>.json` — every poll response for a live run
- `/audit` in the console — every governed write, with before and after

---

## Quick Reference: What Lives Where

| What | Source of Truth | Served From | Edited By | Synced Via |
|---|---|---|---|---|
| Rule code | `origin/cognition-dashboard-devin-integration` | Serving checkout, `pnpm dev` | Devin (PR), engineers (PR) | Merge sync: `git pull --ff-only` |
| Rule settings | `runtime_constants` in `console.db` | Read per decision | Admin on `/admin/policy` | Instant; new keys via `registerToolConstants` |
| Records (refunds, KYC, flags) | `console.db` | Engine read client | Operators through `executeIntent` | Instant |
| Schema | `apps/console/drizzle/` | `console.db` | Devin or engineers (PR) | Merge sync: `pnpm db:migrate` |
| Run state | `devin_runs` in `console.db` | `/runs`, run view | Audited intents only | Polls, **Sync with GitHub** |
| Run brief | `runs/<run_id>/context.json` | Devin attachment | Console at dispatch | Committed as the plan commit |
| Run progress | Devin session `structured_output` | Run view (in memory) | Devin | `GET /api/devin/<runId>` polls |
| Playbook | `.devin/run-protocol.playbook.md` | Devin org playbook | Engineers (PR) | `pnpm devin:playbook` |
| Secrets | `.env` | Server process | You | Restart `pnpm dev` |

---

## Red Flags

1. ❌ `git status` in the serving checkout shows modified tracked files.
2. ❌ The serving checkout is on any branch but `cognition-dashboard-devin-integration`.
3. ❌ `/api/devin/status` says `simulation` when you expect live runs.
4. ❌ `__drizzle_migrations` has fewer rows than the drizzle journal has entries.
5. ❌ `pnpm verify` fails on the integration branch.
6. ❌ A `runs/<run_id>/context.json` differs from what was committed in the plan commit.
7. ❌ A run sits at **Approved** for more than a few minutes with its PR merged on GitHub.
8. ❌ `packages/engine` mentions a tool name.
9. ❌ `.env` or `apps/console/data/` shows up in `git status` as something to commit.
10. ❌ Two org playbooks are titled "Governed console run".

---

## Key Concepts to Remember

1. **Every write is governed.** A refund, a KYC decision, a flag change and a Devin request all
   go through `executeIntent`: validate, idempotency, policy, approval, effect, audit.
2. **Settings move in seconds; code moves through review.** A threshold is a setting. A new
   rule is code.
3. **The plan comes before the edit.** Devin's first commit is `context.json` + `plan.json`; the
   guard holds the diff to it.
4. **The requester never approves.** The approval query excludes them.
5. **Polled progress is never stored.** Only audited transitions change `devin_runs`.
6. **The console pulls; it never pushes.**
7. **An undo is not a `git revert`.** It removes one change and keeps everything merged since.

---

## Pre-Flight Checklist

- [ ] Node 24 and pnpm installed
- [ ] Serving checkout on `cognition-dashboard-devin-integration`, clean, up to date
- [ ] `pnpm install --frozen-lockfile` ran after the last pull
- [ ] `.env` has `DEVIN_API_KEY` and `GITHUB_TOKEN`
- [ ] `apps/console/data/console.db` exists and migrations match the journal
- [ ] `pnpm dev` running on `:3001`
- [ ] `/api/devin/status` reports `"mode":"live"`, `"github":true`, `"error":null`
- [ ] `pnpm devin:playbook` ran after the last playbook change
- [ ] GitHub token can review pull requests on the repository
- [ ] Latest `verify` run on the branch is green
- [ ] `pnpm verify` green locally
- [ ] No run in flight for the tool you're about to change

---

## Emergency Recovery

Resets the serving checkout and its database to a known-good state. **It discards local changes
and every local run record.** Read it before running it.

```bash
#!/usr/bin/env bash
# Reset the serving checkout to origin and re-seed the local database.
set -euo pipefail

BRANCH=cognition-dashboard-devin-integration
REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

echo "== Stop the console on :3001 =="
PID="$(lsof -t -iTCP:3001 -sTCP:LISTEN || true)"
[ -n "$PID" ] && kill "$PID" && echo "stopped $PID" || echo "nothing on :3001"

echo "== Save anything uncommitted =="
if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "emergency-recovery $(date +%Y%m%d-%H%M%S)"
  echo "saved to: $(git stash list | head -1)"
fi

echo "== Back up the database =="
if [ -f apps/console/data/console.db ]; then
  cp apps/console/data/console.db "/tmp/console.db.$(date +%Y%m%d-%H%M%S).bak"
fi

echo "== Reset code to origin =="
git fetch origin
git switch "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "== Reinstall and re-seed =="
pnpm install --frozen-lockfile
rm -rf apps/console/data
pnpm db:setup

echo "== Verify =="
pnpm verify

echo "Done. Start the console with: pnpm dev"
```

---

## Integration Test Script

Read-only: it changes nothing. Save as `/tmp/integration-check.sh` and run
`bash /tmp/integration-check.sh` from the repo root.

```bash
#!/usr/bin/env bash
# Prints ✅/❌ per check for the console's integrations. Read-only.
set -uo pipefail

BRANCH=cognition-dashboard-devin-integration
PORT="${PORT:-3001}"
DB=apps/console/data/console.db
fails=0

ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; fails=$((fails + 1)); }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

cd "$(git rev-parse --show-toplevel)" || exit 1

check "Node 24"                       '[ "$(node -v | cut -d. -f1)" = "v24" ]'
check "pnpm installed"                'pnpm -v'
check "On $BRANCH"                    '[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ]'
check "Working tree clean"            '[ -z "$(git status --porcelain | grep -vE "^\?\? runs/[^/]+/context\.json$")" ]'
check "Up to date with origin"        'git fetch -q origin && [ "$(git rev-list --count HEAD..origin/$BRANCH)" = "0" ]'
check ".env present"                  '[ -f .env ]'
check "DEVIN_API_KEY set"             'grep -q "^DEVIN_API_KEY=cog_" .env'
check "GITHUB_TOKEN set"              'grep -q "^GITHUB_TOKEN=." .env'
check "Database exists"               '[ -f "$DB" ]'
check "Migrations applied"            '[ "$(sqlite3 "$DB" "select count(*) from __drizzle_migrations;")" = "$(node -e "console.log(require(\"./apps/console/drizzle/meta/_journal.json\").entries.length)")" ]'
check "Refund manager line present"   '[ -n "$(sqlite3 "$DB" "select value_json from runtime_constants where key = '"'"'refunds.manager_approval_usd_minor'"'"';")" ]'
check "No tool name in engine"        '! grep -rqiwE "kyc|refunds|flags" packages/engine/src'
check "Playbook file present"         '[ -f .devin/run-protocol.playbook.md ]'
check "Console answers on :$PORT"     '[ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/)" = "200" ]'

STATUS="$(curl -s "http://localhost:$PORT/api/devin/status" || true)"
check "Devin live"                    'echo "$STATUS" | grep -q "\"mode\":\"live\""'
check "Devin key accepted"            'echo "$STATUS" | grep -q "\"error\":null"'
check "GitHub token configured"       'echo "$STATUS" | grep -q "\"github\":true"'
check "No run stuck in flight > 1 day" '[ "$(sqlite3 "$DB" "select count(*) from devin_runs where status in ('"'"'dispatched'"'"','"'"'running'"'"','"'"'approved'"'"') and updated_at < (strftime('"'"'%s'"'"','"'"'now'"'"') - 86400) * 1000;")" = "0" ]'

echo
if [ "$fails" -eq 0 ]; then echo "All checks passed."; else echo "$fails check(s) failed."; fi
exit "$fails"
```

`pnpm verify` is not part of the script because it takes about a minute; run it separately
(step 13).
