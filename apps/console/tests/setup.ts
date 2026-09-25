import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test file gets its own SQLite file; the client reads this on import.
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "ops-console-")),
  "test.db",
);

// `pnpm verify` never reaches the network: the Devin and GitHub clients take
// an injected fetch, and anything that falls through to the global one fails.
globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  throw new Error(`Live HTTP is disabled under test: ${url}`);
};
