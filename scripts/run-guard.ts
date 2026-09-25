import { execFileSync } from "node:child_process";
import { ContextFile, PlanFile, type ContextFile as Context, type PlanFile as Plan } from "@console/tool-automation/run-files";
import { ENGINE_SCOPE_PATHS } from "@console/tool-automation/specs";

/**
 * Guard checks for a Devin run (`docs/DEVIN_RUN_PROTOCOL.md` § Guard checks).
 *
 * A run is a branch whose first commit adds `runs/<run_id>/context.json` and
 * `runs/<run_id>/plan.json`. This script diffs the branch against its merge
 * base with the integration branch and holds the diff to that plan. It runs
 * in `pnpm verify` and as the `guards` job in `.github/workflows/verify.yml`,
 * which posts the same report as a PR comment. A branch that adds no run
 * passes with "No run on this branch".
 *
 * Checks implemented here, each reported by name:
 *
 *   Stays in plan        every changed path is in `plan.files[]` or under `runs/<run_id>/`
 *   Plan stays in scope  every `plan.files[].path` matches a glob in `context.scope`
 *   Context untouched    `context.json` and `plan.json` do not change after the plan
 *                        commit (the first commit on the branch). Other files under
 *                        `runs/<run_id>/`, such as `replay.json`, may. The other half
 *                        of this check, comparing `context.json`'s SHA-256 with the
 *                        dispatch audit row, lives in the automation tool's
 *                        `approve_pr` rule: CI cannot read the console's SQLite
 *   Engine untouched     scope `rule` only. Nothing under the engine paths below changes
 *   Tests never shrink   per test file, `it(`/`test(` counts at HEAD are at or above the
 *                        base, no test file is deleted, and no `.skip`/`.only`/`.todo`
 *                        appears. REMOVAL and REVERSAL may lose exactly the tests in
 *                        `plan.removed_tests[]`
 *   No type escapes      no added line carries `any` as a type, `@ts-ignore`,
 *                        `@ts-expect-error`, `eslint-disable` or `as unknown as`
 *
 * Only undo, Seed is not state, Humans approve, Engine owner approves and No
 * live writes are enforced by review, GitHub branch protection and the
 * playbook, not by this script; they are listed in the report so the PR
 * comment reads as the full table.
 *
 * Scope is inferred from `context.scope`: the console appends
 * `ENGINE_SCOPE_PATHS` to the globs for an engine-scope run, so a context that
 * carries all of them is engine scope and anything else is rule scope.
 *
 * Usage: tsx scripts/run-guard.ts [--base <ref>] [--markdown]
 *   --base      ref to diff against (default: RUN_GUARD_BASE, then
 *               origin/$GITHUB_BASE_REF, then origin/cognition-dashboard-devin-integration)
 *   --markdown  print the report as a Markdown table for the PR comment
 */

const INTEGRATION_BRANCH = "cognition-dashboard-devin-integration";

/** Paths a rule-scope run may not touch. */
const ENGINE_PATHS = [
  "packages/engine/",
  "packages/db/",
  "packages/db-core/",
  "packages/db-write/",
  "packages/permissions/",
  "apps/console/drizzle/",
  "scripts/check-boundaries.ts",
  "scripts/run-guard.ts",
  "AGENTS.md",
  "package.json",
  "pnpm-lock.yaml",
];

const DELEGATED = [
  "Only undo",
  "Seed is not state",
  "Humans approve",
  "Engine owner approves",
  "No live writes",
];

const TEST_FILE_RE = /\.test\.tsx?$/;
const TEST_CALL_RE = /(?<![.\w$])(?:it|test)\s*\(/g;
const TEST_NAME_RE = /(?<![.\w$])(?:it|test)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
const TEST_MODIFIER_RE = /(?<![.\w$])(?:it|test|describe)\.(?:skip|only|todo)\b/g;
const SOURCE_FILE_RE = /\.(?:ts|tsx|js|mjs|cjs)$/;
const TYPE_ESCAPE_RES: Array<{ re: RegExp; label: string }> = [
  { re: /(?:[:<,(]|\bas)\s*any\b(?!\w)/, label: "any" },
  { re: /@ts-ignore/, label: "@ts-ignore" },
  { re: /@ts-expect-error/, label: "@ts-expect-error" },
  { re: /eslint-disable/, label: "eslint-disable" },
  { re: /\bas\s+unknown\s+as\b/, label: "as unknown as" },
];

interface CheckResult {
  name: string;
  pass: boolean | null;
  reason: string;
}

interface GuardReport {
  run: { id: string; kind: Context["kind"]; scope: "rule" | "engine"; base: string; planCommit: string } | null;
  checks: CheckResult[];
}

interface Change {
  status: string;
  /** Path at HEAD (or the deleted path). */
  path: string;
  /** Previous path for renames and copies. */
  from?: string;
}

function main(): void {
  const args = process.argv.slice(2);
  const markdown = args.includes("--markdown");
  const baseIdx = args.indexOf("--base");
  const baseArg = baseIdx >= 0 ? args[baseIdx + 1] : undefined;

  const report = runGuard({ cwd: process.cwd(), base: baseArg });
  const failed = report.checks.some((c) => c.pass === false);

  if (markdown) {
    process.stdout.write(renderMarkdown(report));
    process.stderr.write(renderText(report));
  } else {
    process.stdout.write(renderText(report));
  }
  process.exit(failed ? 1 : 0);
}

function runGuard(opts: { cwd: string; base?: string }): GuardReport {
  const git = (...argv: string[]): string =>
    execFileSync("git", argv, { cwd: opts.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  const tryGit = (...argv: string[]): string | null => {
    try {
      return git(...argv);
    } catch {
      return null;
    }
  };

  const baseRef = resolveBase(opts.base, tryGit);
  if (!baseRef) {
    return {
      run: null,
      checks: [{ name: "No run on this branch", pass: true, reason: `base ref not found (tried ${INTEGRATION_BRANCH})` }],
    };
  }
  const mergeBase = tryGit("merge-base", baseRef, "HEAD");
  if (!mergeBase) {
    return { run: null, checks: [{ name: "No run on this branch", pass: true, reason: `no merge base with ${baseRef}` }] };
  }

  const changes = parseNameStatus(git("diff", "--name-status", "-M", mergeBase, "HEAD"));
  const planAdds = changes.filter((c) => c.status === "A" && /^runs\/[^/]+\/plan\.json$/.test(c.path));
  if (planAdds.length === 0) {
    return { run: null, checks: [{ name: "No run on this branch", pass: true, reason: `no runs/<run_id>/plan.json added since ${mergeBase.slice(0, 7)}` }] };
  }
  if (planAdds.length > 1) {
    return {
      run: null,
      checks: [
        {
          name: "One run per branch",
          pass: false,
          reason: `branch adds ${planAdds.length} plan files: ${planAdds.map((c) => c.path).join(", ")}`,
        },
      ],
    };
  }

  const runId = planAdds[0].path.split("/")[1];
  const runDir = `runs/${runId}/`;
  const planCommit = git("rev-list", "--reverse", "--topo-order", `${mergeBase}..HEAD`).split("\n")[0];

  const contextRaw = tryGit("show", `HEAD:${runDir}context.json`);
  const planRaw = tryGit("show", `HEAD:${runDir}plan.json`);
  if (contextRaw === null) {
    return { run: null, checks: [{ name: "Run files parse", pass: false, reason: `${runDir}context.json is missing at HEAD` }] };
  }
  const context = parseJson(ContextFile, contextRaw, `${runDir}context.json`);
  const plan = parseJson(PlanFile, planRaw ?? "", `${runDir}plan.json`);
  if (!context.ok || !plan.ok) {
    return {
      run: null,
      checks: [{ name: "Run files parse", pass: false, reason: [context, plan].flatMap((r) => (r.ok ? [] : [r.error])).join("; ") }],
    };
  }
  if (context.value.run_id !== runId) {
    return {
      run: null,
      checks: [{ name: "Run files parse", pass: false, reason: `context.json run_id ${context.value.run_id} does not match ${runDir}` }],
    };
  }

  const scope: "rule" | "engine" = ENGINE_SCOPE_PATHS.every((p) => context.value.scope.includes(p)) ? "engine" : "rule";
  const ctx: RunContext = { git, tryGit, mergeBase, planCommit, runDir, context: context.value, plan: plan.value, changes, scope };

  const checks: CheckResult[] = [
    staysInPlan(ctx),
    planStaysInScope(ctx),
    contextUntouched(ctx),
    engineUntouched(ctx),
    testsNeverShrink(ctx),
    noTypeEscapes(ctx),
    ...DELEGATED.map((name) => ({ name, pass: null, reason: "enforced by review/GitHub/playbook" })),
  ];

  return { run: { id: runId, kind: context.value.kind, scope, base: mergeBase, planCommit }, checks };
}

interface RunContext {
  git: (...argv: string[]) => string;
  tryGit: (...argv: string[]) => string | null;
  mergeBase: string;
  planCommit: string;
  runDir: string;
  context: Context;
  plan: Plan;
  changes: Change[];
  scope: "rule" | "engine";
}

function staysInPlan({ plan, runDir, changes }: RunContext): CheckResult {
  const planned = new Set(plan.files.map((f) => f.path));
  const allowed = (p: string) => planned.has(p) || p.startsWith(runDir);
  const outside = changes.flatMap((c) => [c.path, ...(c.from ? [c.from] : [])]).filter((p) => !allowed(p));
  return outside.length === 0
    ? { name: "Stays in plan", pass: true, reason: `${changes.length} changed path(s), all in plan.json or ${runDir}` }
    : { name: "Stays in plan", pass: false, reason: `outside plan.json: ${list(outside)}` };
}

function planStaysInScope({ plan, context }: RunContext): CheckResult {
  const globs = context.scope.map((g) => ({ glob: g, re: globToRegExp(g) }));
  const outside = plan.files.map((f) => f.path).filter((p) => !globs.some((g) => g.re.test(p)));
  return outside.length === 0
    ? { name: "Plan stays in scope", pass: true, reason: `${plan.files.length} planned path(s) match context.scope` }
    : { name: "Plan stays in scope", pass: false, reason: `not in context.scope: ${list(outside)}` };
}

function contextUntouched({ git, planCommit, runDir }: RunContext): CheckResult {
  const frozen = [`${runDir}context.json`, `${runDir}plan.json`];
  const changed = git("diff", "--name-only", planCommit, "HEAD", "--", ...frozen).split("\n").filter(Boolean);
  return changed.length === 0
    ? { name: "Context untouched", pass: true, reason: `context.json and plan.json unchanged since plan commit ${planCommit.slice(0, 7)}` }
    : { name: "Context untouched", pass: false, reason: `changed after plan commit ${planCommit.slice(0, 7)}: ${list(changed)}` };
}

function engineUntouched({ scope, changes }: RunContext): CheckResult {
  if (scope === "engine") {
    return { name: "Engine untouched", pass: true, reason: "engine scope; the engine owner approves instead" };
  }
  const hit = changes
    .flatMap((c) => [c.path, ...(c.from ? [c.from] : [])])
    .filter((p) => ENGINE_PATHS.some((e) => (e.endsWith("/") ? p.startsWith(e) : p === e)));
  return hit.length === 0
    ? { name: "Engine untouched", pass: true, reason: "no engine, db, permissions, migration or governance file changed" }
    : { name: "Engine untouched", pass: false, reason: `rule scope changed: ${list(hit)}` };
}

function testsNeverShrink({ tryGit, mergeBase, plan, context, changes }: RunContext): CheckResult {
  const mayRemove = context.kind === "IMPLEMENTATION/REMOVAL" || context.kind === "REVERSAL";
  const removable = new Map<string, Set<string>>();
  for (const t of plan.removed_tests ?? []) {
    const names = removable.get(t.file) ?? new Set<string>();
    names.add(t.name);
    removable.set(t.file, names);
  }
  const problems: string[] = [];
  let files = 0;

  for (const c of changes) {
    const isTest = TEST_FILE_RE.test(c.path) || (c.from !== undefined && TEST_FILE_RE.test(c.from));
    if (!isTest) continue;
    files += 1;
    const basePath = c.from ?? c.path;
    const before = c.status === "A" ? "" : (tryGit("show", `${mergeBase}:${basePath}`) ?? "");
    const after = c.status === "D" ? "" : (tryGit("show", `HEAD:${c.path}`) ?? "");

    const beforeNames = testNames(before);
    const afterNames = testNames(after);
    const beforeCount = count(before, TEST_CALL_RE);
    const afterCount = count(after, TEST_CALL_RE);
    const allowed = removable.get(basePath) ?? new Set<string>();
    const missing = beforeNames.filter((n) => !afterNames.includes(n));
    const unlisted = missing.filter((n) => !allowed.has(n));
    const allowedLoss = mayRemove ? missing.length - unlisted.length : 0;

    if (c.status === "D") {
      if (!mayRemove || unlisted.length > 0 || beforeCount > allowedLoss) {
        problems.push(`${basePath} deleted (${beforeCount} test(s))`);
      }
    } else if (afterCount < beforeCount) {
      const drop = beforeCount - afterCount;
      if (!mayRemove) {
        problems.push(`${c.path}: ${beforeCount} → ${afterCount}`);
      } else if (unlisted.length > 0) {
        problems.push(`${c.path}: removed tests not in plan.removed_tests: ${unlisted.map((n) => JSON.stringify(n)).join(", ")}`);
      } else if (drop > allowedLoss) {
        problems.push(`${c.path}: ${beforeCount} → ${afterCount}, only ${allowedLoss} removal(s) listed in plan.removed_tests`);
      }
    } else if (!mayRemove && unlisted.length > 0) {
      problems.push(`${c.path}: tests renamed or replaced without a count drop: ${unlisted.map((n) => JSON.stringify(n)).join(", ")}`);
    }

    if (count(after, TEST_MODIFIER_RE) > count(before, TEST_MODIFIER_RE)) {
      problems.push(`${c.path}: adds .skip/.only/.todo`);
    }
  }

  return problems.length === 0
    ? { name: "Tests never shrink", pass: true, reason: files === 0 ? "no test file changed" : `${files} test file(s) at or above base counts` }
    : { name: "Tests never shrink", pass: false, reason: problems.join("; ") };
}

function noTypeEscapes({ git, mergeBase, runDir, changes }: RunContext): CheckResult {
  const sources = changes.filter((c) => c.status !== "D" && SOURCE_FILE_RE.test(c.path) && !c.path.startsWith(runDir)).map((c) => c.path);
  if (sources.length === 0) {
    return { name: "No type escapes", pass: true, reason: "no source file changed" };
  }
  const diff = git("diff", "-U0", "--no-color", mergeBase, "HEAD", "--", ...sources);
  const hits: string[] = [];
  let file = "";
  let line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "");
    } else if (raw.startsWith("@@")) {
      const m = /\+(\d+)/.exec(raw);
      line = m ? Number(m[1]) : 0;
    } else if (raw.startsWith("+")) {
      const text = raw.slice(1);
      for (const { re, label } of TYPE_ESCAPE_RES) {
        if (re.test(text)) hits.push(`${file}:${line} (${label})`);
      }
      line += 1;
    }
  }
  return hits.length === 0
    ? { name: "No type escapes", pass: true, reason: `no escape hatch in ${sources.length} changed source file(s)` }
    : { name: "No type escapes", pass: false, reason: list(hits) };
}

function resolveBase(arg: string | undefined, tryGit: (...argv: string[]) => string | null): string | null {
  const candidates = [
    arg,
    process.env.RUN_GUARD_BASE,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined,
    `origin/${INTEGRATION_BRANCH}`,
    INTEGRATION_BRANCH,
  ];
  for (const ref of candidates) {
    if (ref && tryGit("rev-parse", "--verify", "--quiet", `${ref}^{commit}`) !== null) return ref;
  }
  return null;
}

function parseNameStatus(out: string): Change[] {
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, a, b] = line.split("\t");
      return b !== undefined ? { status: status[0], path: b, from: a } : { status: status[0], path: a };
    });
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseJson<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } }, raw: string, label: string): Parsed<T> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `${label}: ${e instanceof Error ? e.message : String(e)}` };
  }
  const result = schema.safeParse(json);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: `${label}: ${result.error.message.split("\n")[0]}` };
}

/** `**` spans directories, `*` and `?` stay within one segment; everything else is literal. */
function globToRegExp(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        const slashAfter = glob[i + 2] === "/";
        re += slashAfter ? "(?:.*/)?" : ".*";
        i += slashAfter ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(re + "$");
}

function testNames(source: string): string[] {
  return Array.from(source.matchAll(TEST_NAME_RE), (m) => m[2]);
}

function count(source: string, re: RegExp): number {
  return Array.from(source.matchAll(re)).length;
}

function list(items: string[]): string {
  return items.length > 6 ? `${items.slice(0, 6).join(", ")} and ${items.length - 6} more` : items.join(", ");
}

function renderText(report: GuardReport): string {
  const lines: string[] = [];
  if (report.run) {
    const r = report.run;
    lines.push(`Run ${r.id} (${r.kind}, scope ${r.scope}) — base ${r.base.slice(0, 7)}, plan commit ${r.planCommit.slice(0, 7)}`);
  }
  for (const c of report.checks) {
    const mark = c.pass === null ? "  —  " : c.pass ? "PASS " : "FAIL ";
    lines.push(`${mark} ${c.name} — ${c.reason}`);
  }
  return lines.join("\n") + "\n";
}

function renderMarkdown(report: GuardReport): string {
  const failed = report.checks.some((c) => c.pass === false);
  const lines: string[] = ["<!-- run-guard -->"];
  if (report.run) {
    const r = report.run;
    lines.push(
      `### Run guard: ${failed ? "failed" : "passed"}`,
      "",
      `Run \`${r.id}\` (${r.kind}, scope \`${r.scope}\`), base \`${r.base.slice(0, 7)}\`, plan commit \`${r.planCommit.slice(0, 7)}\`.`,
    );
  } else {
    lines.push(`### Run guard: ${failed ? "failed" : "passed"}`);
  }
  lines.push("", "| Check | Result | Reason |", "| --- | --- | --- |");
  for (const c of report.checks) {
    const mark = c.pass === null ? "n/a" : c.pass ? "pass" : "**fail**";
    lines.push(`| **${c.name}** | ${mark} | ${c.reason.replace(/\|/g, "\\|")} |`);
  }
  return lines.join("\n") + "\n";
}

main();
