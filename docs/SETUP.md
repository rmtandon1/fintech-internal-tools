# Setup

How to get the console running on a new machine, connect it to Devin and GitHub, and fix what
goes wrong on the way. For using the console once it runs, see the [README](../README.md#usage).

## What gets set up

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1  TOOLCHAIN      Node 24 · pnpm · git                                │
├──────────────────────────────────────────────────────────────────────┤
│ 2  DEPENDENCIES   pnpm install  (builds better-sqlite3 natively)      │
├──────────────────────────────────────────────────────────────────────┤
│ 3  DATABASE       pnpm db:setup → apps/console/data/console.db        │
├──────────────────────────────────────────────────────────────────────┤
│ 4  SECRETS        .env at the repo root: DEVIN_API_KEY, GITHUB_TOKEN   │
├──────────────────────────────────────────────────────────────────────┤
│ 5  DEVIN          pnpm devin:playbook → "Governed console run"        │
├──────────────────────────────────────────────────────────────────────┤
│ 6  SERVER         pnpm dev → http://localhost:3001                    │
└──────────────────────────────────────────────────────────────────────┘
```

Each layer needs the one above it. When something fails, start at the lowest layer that works
and move down.

## Install

```bash
node --version                      # v24.x
pnpm --version                      # CI pins 12.6.0
git clone https://github.com/rmtandon1/fintech-internal-tools.git
cd fintech-internal-tools
pnpm install
cp .env.example .env                # then set your own DEVIN_API_KEY and GITHUB_TOKEN; blank = simulation mode
pnpm db:setup
pnpm devin:playbook                 # needs DEVIN_API_KEY
pnpm dev
```

Check each layer:

```bash
ls apps/console/data/console.db                     # database exists
curl -s localhost:3001/api/devin/status             # "mode":"live", "github":true
pnpm verify                                          # lint, typecheck, boundaries, guard, tests
```

## Install-time problems

### `pnpm: command not found`

- Enable pnpm through Corepack, which ships with Node:

  ```bash
  corepack enable
  corepack prepare pnpm@12.6.0 --activate
  pnpm --version
  ```

- Or install it globally: `npm install -g pnpm@12.6.0`.

### Wrong Node version, or `process.loadEnvFile is not a function`

- The console reads `.env` with `process.loadEnvFile`, which older Node versions lack. Use Node 24:

  ```bash
  nvm install 24 && nvm use 24          # or: fnm use 24 / volta install node@24
  node --version
  ```

- Reinstall after switching, so native modules match the new Node:

  ```bash
  rm -rf node_modules apps/*/node_modules packages/*/node_modules tools/*/node_modules
  pnpm install
  ```

### `better-sqlite3` fails to build during `pnpm install`

- Install the native toolchain, then rebuild:

  ```bash
  xcode-select --install                 # macOS
  # sudo apt-get install -y build-essential python3   # Debian/Ubuntu
  pnpm rebuild better-sqlite3
  ```

- `pnpm-workspace.yaml` must still list `better-sqlite3: true` under `allowBuilds`. Without it, pnpm
  skips the build step and the server fails with "Could not locate the bindings file".

### `pnpm setup` did something unexpected

- `pnpm setup` is pnpm's own shell installer, not this project's. The database script is
  `pnpm db:setup`:

  ```bash
  pnpm db:setup
  ```

### Pages fail to render with `no such table`

- The database was never created, or was created by older code. Rebuild it:

  ```bash
  # stop pnpm dev first
  pnpm db:reset   # rebuilds demo data, keeping recorded runs and their audit rows
  # or, to wipe everything including recorded runs:
  rm -rf apps/console/data && pnpm db:setup
  pnpm dev
  ```

- After `rm -rf apps/console/data`, pick a role again in **Viewing as** — that regenerates the
  secret that signs the role cookie. `pnpm db:reset` keeps it. To seed only a tool whose queue is
  still empty (e.g. one a merge just registered) without touching live data, run `pnpm db:seed:new`.

### `EADDRINUSE: address already in use :::3001`

- Another console is running. Find and stop it:

  ```bash
  lsof -nP -iTCP:3001 -sTCP:LISTEN
  kill <pid>
  ```

- Or run this one on another port: `pnpm --filter @console/app exec next dev --port 3002`.

### `/api/devin/status` says `"mode":"simulation"`

- `.env` must sit at the repository root, next to `package.json`, not in `apps/console/`:

  ```bash
  ls -la .env
  grep -c '^DEVIN_API_KEY=cog_' .env         # 1
  ```

- An exported shell variable wins over the file, even an empty one:

  ```bash
  env | grep DEVIN_API_KEY
  unset DEVIN_API_KEY
  ```

- Restart `pnpm dev`. The file is read once per server process.

### `/api/devin/status` shows an `error`

- "not scoped to an organisation": set the organisation yourself.

  ```bash
  echo 'DEVIN_ORG_ID=org-…' >> .env
  ```

- 401 or 403 from Devin: the key is wrong or revoked. Create a new one in Devin and replace it in
  `.env`. The console rechecks a failed key every 15 seconds.

### `pnpm devin:playbook` fails

- It reads `DEVIN_API_KEY` from `.env`, so fix the key first (above).
- Rerun it after every change to `.devin/run-protocol.playbook.md`. Devin keeps its old copy until
  then. A missing playbook doesn't block a run, because the prompt also names the file.

### `"github":false`, or **Review and approve** never appears

- Add a token with pull request read and write on the repository:

  ```bash
  echo 'GITHUB_TOKEN=ghp_…' >> .env
  ```

- If approvals given on GitHub are not picked up, set `GITHUB_APPROVER_LOGIN` to the approving
  engineer's GitHub login (default `rmtandon1`).

- The console reads `owner/repo` from the `origin` remote. Check it points at GitHub, or set it:

  ```bash
  git remote get-url origin                  # https://github.com/<owner>/<repo>.git
  echo 'GITHUB_REPOSITORY=<owner>/<repo>' >> .env
  ```

### `Module not found: '@console/tool-…'` after pulling

- A merge added a workspace package and the install **Pull merged code** runs didn't finish. Link
  it and restart:

  ```bash
  pnpm install
  # restart pnpm dev
  ```

### `pnpm typecheck` fails on a route that no longer exists

- Next keeps generated types for deleted routes. Clear them:

  ```bash
  rm -rf apps/console/.next
  pnpm typecheck
  ```

### Merge sync says "working tree has uncommitted changes"

- The console only pulls into a clean checkout on the integration branch:

  ```bash
  git status --short
  git switch cognition-dashboard-devin-integration
  rm -rf runs/<stopped_run_id>               # stray folder from a run that never merged
  ```

- Keep feature work in a separate worktree, so the checkout the console runs from stays clean:

  ```bash
  git worktree add ../console-work -b my-change origin/cognition-dashboard-devin-integration
  ```
