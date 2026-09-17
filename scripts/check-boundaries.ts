import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ENGINE = join(SRC, "engine");

/** Tool names the engine must never know about. */
const TOOL_NAMES = ["kyc", "refunds", "flags"];

/** Only the engine may take a write handle; everything else writes via intents. */
const WRITE_CLIENT = "@/db/write-client";
const WRITE_CLIENT_ALLOWED = [join("src", "engine"), join("src", "db")];

const failures: string[] = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, "utf8");

  if (file.startsWith(ENGINE + sep)) {
    for (const name of TOOL_NAMES) {
      const hit = new RegExp(`\\b${name}\\b`, "i").exec(source);
      if (hit) {
        failures.push(
          `${rel}: engine references tool name "${hit[0]}" — the engine must stay generic`,
        );
      }
    }
  }

  if (
    source.includes(WRITE_CLIENT) &&
    !WRITE_CLIENT_ALLOWED.some((prefix) => rel.startsWith(prefix))
  ) {
    failures.push(
      `${rel}: imports ${WRITE_CLIENT} — writes must go through executeIntent`,
    );
  }
}

if (failures.length > 0) {
  console.error("Boundary check failed:\n" + failures.map((f) => `  • ${f}`).join("\n"));
  process.exit(1);
}
console.log("Boundary check passed.");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}
