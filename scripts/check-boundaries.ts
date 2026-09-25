import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * pnpm enforces the package graph: a workspace package can only import what
 * its own package.json lists. This script covers the three things pnpm cannot:
 *
 *  1. the engine must stay tool-agnostic as a matter of *content*, not just
 *     dependencies — no tool name may appear in `packages/engine`;
 *  2. relative imports must not climb out of their own package, since
 *     `../../db-write/src` would bypass the manifest entirely;
 *  3. `@console/db-write` may only be declared by the engine, so the write
 *     handle stays on the governed path.
 */

const ROOT = process.cwd();
const WORKSPACE_GLOBS = ["apps", "packages", "tools"];

/** Tool names the engine must never know about. */
const TOOL_NAMES = ["kyc", "refunds", "flags"];

const ENGINE_PACKAGE = join(ROOT, "packages", "engine");

/** Packages permitted to depend on the write handle. */
const WRITE_CLIENT = "@console/db-write";
const WRITE_CLIENT_ALLOWED = new Set(["@console/engine"]);

/** Static `import ... from "x"`, `export ... from "x"` and side-effect `import "x"`. */
const IMPORT_RE = /^\s*(?:(?:import|export)\b[^'"]*?from\s*|import\s*)['"]([^'"]+)['"]/gm;

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const failures: string[] = [];

for (const pkgDir of workspacePackages()) {
  const manifest = JSON.parse(
    readFileSync(join(pkgDir, "package.json"), "utf8"),
  ) as Manifest;
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);

  if (declared.has(WRITE_CLIENT) && !WRITE_CLIENT_ALLOWED.has(manifest.name)) {
    failures.push(
      `${relative(ROOT, pkgDir)}/package.json: depends on ${WRITE_CLIENT} — writes must go through executeIntent`,
    );
  }

  for (const file of walk(pkgDir)) {
    const rel = relative(ROOT, file);
    const source = readFileSync(file, "utf8");

    if (pkgDir === ENGINE_PACKAGE) {
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
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (!target.startsWith(pkgDir + sep)) {
          failures.push(
            `${rel}: imports ${specifier} — relative imports may not leave the package; declare a workspace dependency instead`,
          );
        }
      } else if (specifier.startsWith("@console/")) {
        const name = specifier.split("/").slice(0, 2).join("/");
        if (name !== manifest.name && !declared.has(name)) {
          failures.push(
            `${rel}: imports ${specifier} — ${name} is not declared in ${manifest.name}'s package.json`,
          );
        }
      }
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

function* workspacePackages(): Generator<string> {
  for (const group of WORKSPACE_GLOBS) {
    const dir = join(ROOT, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (existsSync(join(full, "package.json"))) yield full;
    }
  }
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}
