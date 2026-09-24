import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ENGINE = join(SRC, "engine");

/** Tool names the engine must never know about. */
const TOOL_NAMES = ["kyc", "refunds", "flags"];

/**
 * Import edges a folder may not take. These mirror the package graph the
 * repo is converging on: engine and db are leaves that know nothing about
 * tools, and only the engine holds a write handle.
 */
const FORBIDDEN_IMPORTS: { from: string; target: RegExp; why: string }[] = [
  {
    from: join("src", "engine"),
    target: /^@\/tools(\/|$)/,
    why: "the engine resolves tools through configureEngine, never by import",
  },
  {
    from: join("src", "db"),
    target: /^@\/tools(\/|$)/,
    why: "db knows only the engine tables; tools own and aggregate their schema",
  },
];

/** Only the engine may take a write handle; everything else writes via intents. */
const WRITE_CLIENT = /^@\/db\/write-client$/;
const WRITE_CLIENT_ALLOWED = [join("src", "engine") + sep, join("src", "db") + sep];

/** Static `import ... from "x"`, `export ... from "x"` and side-effect `import "x"`. */
const IMPORT_RE = /^\s*(?:(?:import|export)\b[^'"]*?from\s*|import\s*)['"]([^'"]+)['"]/gm;

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

  for (const specifier of imports(source)) {
    for (const rule of FORBIDDEN_IMPORTS) {
      if (rel.startsWith(rule.from + sep) && rule.target.test(specifier)) {
        failures.push(`${rel}: imports ${specifier} — ${rule.why}`);
      }
    }

    if (
      WRITE_CLIENT.test(specifier) &&
      !WRITE_CLIENT_ALLOWED.some((prefix) => rel.startsWith(prefix))
    ) {
      failures.push(
        `${rel}: imports ${specifier} — writes must go through executeIntent`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Boundary check failed:\n" + failures.map((f) => `  • ${f}`).join("\n"));
  process.exit(1);
}
console.log("Boundary check passed.");

function* imports(source: string): Generator<string> {
  for (const match of source.matchAll(IMPORT_RE)) yield match[1];
}

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
