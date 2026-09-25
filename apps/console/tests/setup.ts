import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test file gets its own SQLite file; the client reads this on import.
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "ops-console-")),
  "test.db",
);

// A developer's repo-root `.env` holds a live DEVIN_API_KEY; tests never read
// it. `loadRepoEnv` looks under REPO_ROOT, which points at an empty directory.
process.env.REPO_ROOT = mkdtempSync(join(tmpdir(), "ops-console-root-"));
delete process.env.DEVIN_API_KEY;
delete process.env.DEVIN_ORG_ID;
delete process.env.DEVIN_PLAYBOOK_ID;

// `pnpm verify` never reaches the network: the Devin and GitHub clients take
// an injected fetch, and anything that falls through to the global one fails.
globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  throw new Error(`Live HTTP is disabled under test: ${url}`);
};
