import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test file gets its own SQLite file; the client reads this on import.
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "ops-console-")),
  "test.db",
);
