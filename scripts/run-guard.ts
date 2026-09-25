import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContextFile, PlanFile } from "../tools/automation/src/run-files";

export const RUN_GUARD_NAMES = [
  "Stays in plan",
  "Plan stays in scope",
  "Run dir frozen",
  "Engine untouched",
  "Tests never shrink",
  "No type escapes",
  "Seed is not state",
  "Only undo",
] as const;

type Result = { name: (typeof RUN_GUARD_NAMES)[number]; pass: boolean; detail?: string };

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();
}

function changedPaths(root: string, range: string): string[] {
  const output = git(root, "diff", "--name-status", "-z", "--find-renames", range);
  const parts = output.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < parts.length - 1;) {
    const status = parts[i++];
    if (status.startsWith("R") || status.startsWith("C")) paths.push(parts[i++]);
    paths.push(parts[i++]);
  }
  return paths;
}

function lines(root: string, range: string, path: string): { added: string[]; removed: string[] } {
  const diff = git(root, "diff", "--unified=0", range, "--", path);
  return {
    added: diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1)),
    removed: diff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).map((line) => line.slice(1)),
  };
}

function matches(pattern: string, path: string): boolean {
  const escaped = pattern.split("**").map((part) =>
    part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"),
  ).join(".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function names(text: string): string[] {
  return [...text.matchAll(/\bit\s*\(\s*(['"\`])([^'"\`]+)\1/g)].map((match) => match[2]);
}

function readAt(root: string, commit: string, path: string): string {
  try {
    return git(root, "show", `${commit}:${path}`);
  } catch {
    return "";
  }
}

function existsAt(root: string, commit: string, path: string): boolean {
  return git(root, "ls-tree", "--name-only", commit, "--", path) === path;
}

function sameAt(root: string, left: string, right: string, path: string): boolean {
  const leftExists = existsAt(root, left, path);
  if (leftExists !== existsAt(root, right, path)) return false;
  return !leftExists || readAt(root, left, path) === readAt(root, right, path);
}

function check(name: Result["name"], pass: boolean, detail?: string): Result {
  return { name, pass, ...(!pass && detail ? { detail } : {}) };
}

export function runGuard(root: string, base = `origin/${process.env.GITHUB_BASE_REF || "cognition-dashboard-devin-integration"}`): Result[] {
  const baseCommit = git(root, "merge-base", base, "HEAD");
  const range = `${baseCommit}...HEAD`;
  const paths = changedPaths(root, range);
  const runIds = [...new Set(paths.map((path) => /^runs\/([^/]+)\/context\.json$/.exec(path)?.[1]).filter(
    (id): id is string => id !== undefined,
  ))];
  if (runIds.length === 0) {
    if (paths.some((path) => path.startsWith("runs/"))) throw new Error("Run files changed without a new context.json");
    return [];
  }
  if (runIds.length !== 1) throw new Error("A PR must contain one run");
  const runId = runIds[0];
  const runDir = `runs/${runId}/`;
  const contextPath = `${runDir}context.json`;
  const planPath = `${runDir}plan.json`;
  if (!existsSync(resolve(root, contextPath)) || !existsSync(resolve(root, planPath))) {
    throw new Error("A run needs both context.json and plan.json");
  }
  const context = ContextFile.parse(JSON.parse(readFileSync(resolve(root, contextPath), "utf8")));
  const plan = PlanFile.parse(JSON.parse(readFileSync(resolve(root, planPath), "utf8")));
  if (context.run_id !== runId) throw new Error("Context run_id does not match its directory");
  const planned = new Map(plan.files.map((file) => [file.path, file.op]));
  const planPaths = new Set(planned.keys());
  const commits = git(root, "rev-list", "--reverse", `${baseCommit}..HEAD`).split("\n");
  const planCommit = commits[0];
  const firstPaths = changedPaths(root, `${planCommit}^..${planCommit}`);
  const runFiles = [contextPath, planPath];
  const frozen = firstPaths.length === 2 && runFiles.every((path) => firstPaths.includes(path))
    && commits.slice(1).every((commit) =>
      !changedPaths(root, `${commit}^..${commit}`).some((path) => path.startsWith(runDir)),
    );
  const results: Result[] = [
    check("Stays in plan", paths.every((path) => {
      if (path.startsWith(runDir)) return true;
      const before = existsAt(root, baseCommit, path);
      const after = existsAt(root, "HEAD", path);
      return planned.get(path) === (before ? (after ? "modify" : "delete") : "create");
    }), "The PR changes an unplanned path or uses a different file operation"),
    check("Plan stays in scope", plan.files.every((file) => context.scope.some((glob) => matches(glob, file.path))),
      "A planned path is outside the context scope"),
    check("Run dir frozen", frozen, "The first commit must contain only context.json and plan.json; later commits cannot touch the run directory"),
  ];

  const protectedPaths = /^(packages\/(engine|db|db-core|db-write|permissions)\/|apps\/console\/drizzle\/|scripts\/(check-boundaries|run-guard)\.ts$|AGENTS\.md$|package\.json$|pnpm-lock\.yaml$)/;
  results.push(check("Engine untouched", context.scope.some((glob) => glob.startsWith("packages/engine/")) ||
    !paths.some((path) => protectedPaths.test(path)), "Rule scope changed a protected engine path"));

  const isTest = (path: string) => /\.test\.tsx?$/.test(path);
  const removed = plan.removed_tests ?? [];
  const testIssues: string[] = [];
  for (const path of paths.filter(isTest)) {
    if (!existsSync(resolve(root, path))) {
      testIssues.push(path);
      continue;
    }
    const before = names(readAt(root, baseCommit, path));
    const after = names(readFileSync(resolve(root, path), "utf8"));
    const missing = [...before];
    for (const name of after) {
      const index = missing.indexOf(name);
      if (index !== -1) missing.splice(index, 1);
    }
    for (const name of missing) {
      if (!removed.some((test) => test.file === path && test.name === name &&
        ["IMPLEMENTATION/REMOVAL", "REVERSAL"].includes(context.kind))) testIssues.push(`${path}: ${name}`);
    }
    if (/\b(?:it|test|describe)\.(?:skip|only|todo)\s*\(/.test(readFileSync(resolve(root, path), "utf8"))) testIssues.push(path);
  }
  results.push(check("Tests never shrink", testIssues.length === 0, testIssues.join(", ")));

  const typeEscapes = paths.filter((path) => /\.[cm]?[jt]sx?$/.test(path)).flatMap((path) =>
    lines(root, range, path).added.filter((line) => /\bany\b|@ts-ignore|eslint-disable|as unknown as/.test(line)),
  );
  results.push(check("No type escapes", typeEscapes.length === 0, typeEscapes.join(", ")));

  const seedChanges = paths.filter((path) => /(^|\/)seed\.tsx?$/.test(path));
  const seedSafe = seedChanges.every((path) => planPaths.has(path) &&
    plan.files.some((file) => file.path === path && /add.*rows?/i.test(file.reason)) &&
    lines(root, range, path).removed.length === 0);
  results.push(check("Seed is not state", seedSafe, "Seeds may only gain spec-requested rows"));

  if (context.kind === "REVERSAL") {
    const target = context.reverses?.merge_commit;
    if (!target) throw new Error("REVERSAL needs reverses.merge_commit");
    if (git(root, "merge-base", target, baseCommit) !== git(root, "rev-parse", target)) {
      throw new Error("REVERSAL target is not an ancestor of the base");
    }
    const production = (path: string) => !isTest(path) && !path.startsWith("runs/");
    const original = changedPaths(root, `${target}^..${target}`).filter(production);
    const later = new Set(changedPaths(root, `${target}..${baseCommit}`).filter(production));
    const violations = original.filter((path) =>
      !sameAt(root, baseCommit, `${target}^`, path) &&
      (sameAt(root, baseCommit, "HEAD", path) || (!later.has(path) && !sameAt(root, `${target}^`, "HEAD", path))),
    );
    violations.push(...paths.filter((path) => production(path) && !original.includes(path) && !later.has(path)));
    results.push(check("Only undo", violations.length === 0, violations.join(", ")));
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--list-checks") {
    for (const name of RUN_GUARD_NAMES) console.log(name);
  } else {
    try {
      const results = runGuard(process.cwd(), process.argv[2] === "--base" && process.argv[3]
        ? process.argv[3]
        : undefined);
      for (const result of results) {
        console.log(`${result.name}: ${result.pass ? "PASS" : `FAIL (${result.detail})`}`);
      }
      if (results.some((result) => !result.pass)) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
