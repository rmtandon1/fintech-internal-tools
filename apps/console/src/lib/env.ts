import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** The repository root: `runs/` and `.env` live here, not in `apps/console`. */
export function repoRoot(): string {
  return process.env.REPO_ROOT ?? resolve(process.cwd(), "../..");
}

const loaded = new Set<string>();

/**
 * Loads `<root>/.env` into `process.env` once per root. Values already in the
 * environment win, so a shell export overrides the file. The file is
 * gitignored and holds `DEVIN_API_KEY`; nothing read here reaches the browser.
 */
export function loadRepoEnv(root = repoRoot()): void {
  const path = join(root, ".env");
  if (loaded.has(path)) return;
  loaded.add(path);
  if (existsSync(path)) process.loadEnvFile(path);
}
