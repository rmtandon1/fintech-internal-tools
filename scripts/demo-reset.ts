import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Starts a fresh take of the demo, in one command, from the repository root:
 *
 *   pnpm exec tsx scripts/demo-reset.ts
 *
 * Each take gets its own branch, `demo-<date>-<time>`, cut from `demo-base`
 * (or `DEMO_BASE_BRANCH`) on GitHub: the code the demo starts from. Devin
 * branches from the take's branch and its pull requests merge into it.
 * Nothing is force-pushed or deleted; earlier takes' branches stay as they are.
 *
 * 1. GitHub: pushes the new take branch at `origin/demo-base`.
 * 2. This checkout: moves the run folders the console wrote under `runs/`
 *    aside, switches to the take branch, and sets `SYNC_BRANCH` in `.env`.
 * 3. Database: `db:reset --fresh`, so there are no runs and the audit log is
 *    empty. The console's per-run files are moved aside too.
 * 4. Devin: re-registers the playbook, so sessions follow this checkout's copy.
 *
 * Stop `pnpm dev` before running it, and start it again afterwards.
 */

const root = process.cwd();
const envFile = join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function run(cmd: string, args: string[], quiet = false): string {
  return execFileSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
  }).trim();
}

function step(text: string): void {
  console.log(`\n▶ ${text}`);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Sets one `KEY=value` line in `.env`, keeping every other line as it is. */
function setEnv(key: string, value: string): void {
  const text = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(text)
    ? text.replace(pattern, line)
    : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileSync(envFile, next);
}

function main(): void {
  if (!existsSync(join(root, ".devin"))) throw new Error("Run this from the repository root.");
  const base = process.env.DEMO_BASE_BRANCH || "demo-base";

  // Anything but the console's own run folders would be carried onto the take branch.
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=all"], true)
    .split("\n")
    .filter((line) => line && !/^\?\? runs\//.test(line));
  if (dirty.length > 0) throw new Error(`Commit or stash these first:\n${dirty.join("\n")}`);

  run("git", ["fetch", "--quiet", "origin", base]);
  const sha = run("git", ["rev-parse", `origin/${base}`], true);
  const take = `demo-${stamp()}`;

  step(`Create ${take} on GitHub at ${base} (${sha.slice(0, 7)})`);
  run("git", ["push", "--quiet", "origin", `${sha}:refs/heads/${take}`]);

  const backup = join(root, "apps/console/data", `before-${take}`);
  step(`Move earlier run files aside to ${backup}`);
  mkdirSync(backup, { recursive: true });
  const untrackedRuns = run("git", ["ls-files", "--others", "--directory", "runs/"], true)
    .split("\n")
    .filter(Boolean);
  if (untrackedRuns.length > 0) mkdirSync(join(backup, "runs"), { recursive: true });
  for (const path of untrackedRuns) {
    const name = path.replace(/^runs\//, "").replace(/\/$/, "");
    renameSync(join(root, "runs", name), join(backup, "runs", name));
  }
  for (const name of ["runs", "replays"]) {
    const dir = join(root, "apps/console/data", name);
    if (existsSync(dir) && readdirSync(dir).length > 0) renameSync(dir, join(backup, `data-${name}`));
  }

  step(`Switch this checkout to ${take}`);
  run("git", ["fetch", "--quiet", "origin", take]);
  run("git", ["switch", "--quiet", "-c", take, "--track", `origin/${take}`]);
  setEnv("SYNC_BRANCH", take);

  step("Install dependencies");
  run("pnpm", ["install", "--frozen-lockfile", "--silent"]);

  step("Rebuild the database: no runs, empty audit log");
  run("pnpm", ["--filter", "@console/app", "db:reset", "--fresh"]);

  if (process.env.DEVIN_API_KEY) {
    step("Re-register the Devin playbook");
    run("pnpm", ["exec", "tsx", "scripts/register-playbook.ts"]);
  } else {
    console.log("\nDEVIN_API_KEY is not set, so the playbook was not re-registered.");
  }

  console.log(`
Ready: take ${take}.
  1. Start the console: pnpm dev
  2. Open a new browser tab at ${process.env.CONSOLE_URL || "http://localhost:3001"} (a new tab replays the pattern monitor).
  3. If a Devin session from an earlier take is still running, stop it at app.devin.ai.`);
}

try {
  main();
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
