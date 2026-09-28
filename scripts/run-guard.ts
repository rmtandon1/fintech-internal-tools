import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContextFile, PlanFile, type ContextFile as Context, type PlanFile as Plan } from "@console/tool-automation/run-files";
import { globToRegExp, SHARED_PATHS } from "@console/tool-automation/shared-paths";

/**
 * Guard checks for a Devin run (`docs/DEVIN_RUN_PROTOCOL.md` § Guard checks).
 *
 * A run is a branch whose first commit adds `runs/<run_id>/context.json` and
 * `runs/<run_id>/plan.json`. This script diffs the branch against its merge
 * base with the integration branch and holds the diff to that plan. It runs
 * in `pnpm verify` and as the `guards` job in `.github/workflows/verify.yml`,
 * which posts the same report as a PR comment. A branch whose history adds
 * no `runs/<run_id>/plan.json` passes with "No run on this branch"; a branch
 * that added one and later deleted it fails. A base ref that cannot be
 * resolved fails rather than passing unchecked.
 *
 * Checks implemented here, each reported by name:
 *
 *   Stays in plan        every changed path is in `plan.files[]` with the op git observed
 *                        (create/modify/delete; a rename is delete + create) or under `runs/<run_id>/`
 *   Plan stays in scope  every `plan.files[].path` matches a glob in `context.allowed_paths`
 *   Run dir frozen       the plan commit (the first commit on the branch) adds exactly
 *                        `context.json` and `plan.json`, and no later commit touches
 *                        either, even if reverted afterwards. Other files under
 *                        `runs/<run_id>/`, such as `replay.json`, may. Its sibling
 *                        Context untouched, comparing `context.json`'s SHA-256 with the
 *                        dispatch audit row, lives in the automation tool's
 *                        `approve_pr` rule: CI cannot read the console's SQLite
 *   Shared code reported always passes; names the shared paths the diff touched, or
 *                        "none", so the review knows whether the engine owner is in it
 *
 * Humans approve, Engine owner approves and No live writes are enforced by
 * review, CODEOWNERS and the playbook, not by this script; the report ends
 * with a note saying so.
 *
 * Usage: tsx scripts/run-guard.ts [--base <ref>] [--markdown] [--list-checks]
 *   --base      ref to diff against (default: RUN_GUARD_BASE, then
 *               origin/$GITHUB_BASE_REF, then origin/cognition-dashboard-devin-integration)
 *   --markdown  print the report as a Markdown table for the PR comment
 *   --list-checks  print the implemented check names, one per line, and exit
 */

const INTEGRATION_BRANCH = "cognition-dashboard-devin-integration";

export const RUN_GUARD_NAMES = [
  "Stays in plan",
  "Plan stays in scope",
  "Run dir frozen",
  "Shared code reported",
] as const;

const DELEGATED_NOTE =
  "Humans approve, Engine owner approves and No live writes are enforced by review, CODEOWNERS and the playbook, not by this script.";

interface CheckResult {
  name: string;
  pass: boolean;
  reason: string;
}

interface GuardReport {
  run: { id: string; operation: Context["operation"]; base: string; planCommit: string } | null;
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
  if (args.includes("--list-checks")) {
    process.stdout.write(RUN_GUARD_NAMES.join("\n") + "\n");
    return;
  }
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

export function runGuard(opts: { cwd: string; base?: string }): GuardReport {
  const git = (...argv: string[]): string =>
    execFileSync("git", argv, { cwd: opts.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  const tryGit = (...argv: string[]): string | null => {
    try {
      return git(...argv);
    } catch {
      return null;
    }
  };

  const explicit = opts.base ?? process.env.RUN_GUARD_BASE;
  const baseRef = resolveBase(explicit, tryGit);
  if (!baseRef) {
    const reason = explicit
      ? `base ref ${explicit} (from ${opts.base ? "--base" : "RUN_GUARD_BASE"}) not found; fetch it`
      : `base ref not found (tried origin/${INTEGRATION_BRANCH}); fetch it or pass --base`;
    return { run: null, checks: [{ name: "Base ref", pass: false, reason }] };
  }
  const mergeBase = tryGit("merge-base", baseRef, "HEAD");
  if (!mergeBase) {
    return { run: null, checks: [{ name: "Base ref", pass: false, reason: `no merge base between HEAD and ${baseRef}` }] };
  }

  const changes = parseNameStatus(git("diff", "--name-status", "-M", mergeBase, "HEAD"));
  const planAdds = Array.from(
    new Set(
      git("log", "--diff-filter=A", "--name-only", "--format=", `${mergeBase}..HEAD`, "--", "runs/*/plan.json")
        .split("\n")
        .filter((p) => /^runs\/[^/]+\/plan\.json$/.test(p)),
    ),
  );
  if (planAdds.length === 0) {
    const stray = changes.flatMap((c) => [c.path, ...(c.from ? [c.from] : [])]).filter((p) => p.startsWith("runs/"));
    return stray.length > 0
      ? { run: null, checks: [{ name: "No run on this branch", pass: false, reason: `runs/ changes without a new plan.json: ${list(stray)}` }] }
      : { run: null, checks: [{ name: "No run on this branch", pass: true, reason: `no runs/<run_id>/plan.json added since ${mergeBase.slice(0, 7)}` }] };
  }
  if (planAdds.length > 1) {
    return {
      run: null,
      checks: [{ name: "One run per branch", pass: false, reason: `branch adds ${planAdds.length} plan files: ${planAdds.join(", ")}` }],
    };
  }

  const runId = planAdds[0].split("/")[1];
  const runDir = `runs/${runId}/`;
  const planCommit = git("rev-list", "--reverse", "--topo-order", `${mergeBase}..HEAD`).split("\n")[0];

  const contextRaw = tryGit("show", `HEAD:${runDir}context.json`);
  const planRaw = tryGit("show", `HEAD:${runDir}plan.json`);
  if (contextRaw === null || planRaw === null) {
    const missing = [contextRaw === null ? "context.json" : null, planRaw === null ? "plan.json" : null].filter(Boolean).join(" and ");
    return { run: null, checks: [{ name: "Run files parse", pass: false, reason: `${runDir}${missing} missing at HEAD (run files were added on this branch)` }] };
  }
  const context = parseJson(ContextFile, contextRaw, `${runDir}context.json`);
  const plan = parseJson(PlanFile, planRaw, `${runDir}plan.json`);
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

  const ctx: RunContext = { git, mergeBase, planCommit, runDir, context: context.value, plan: plan.value, changes };

  const checks: CheckResult[] = [
    staysInPlan(ctx),
    planStaysInScope(ctx),
    runDirFrozen(ctx),
    sharedCodeReported(ctx),
  ];

  return { run: { id: runId, operation: context.value.operation, base: mergeBase, planCommit }, checks };
}

interface RunContext {
  git: (...argv: string[]) => string;
  mergeBase: string;
  planCommit: string;
  runDir: string;
  context: Context;
  plan: Plan;
  changes: Change[];
}

/** Each changed path must be planned with the operation git observed; a rename is a delete plus a create. */
function staysInPlan({ plan, runDir, changes }: RunContext): CheckResult {
  const planned = new Map(plan.files.map((f) => [f.path, f.op]));
  const OPS: Record<string, Plan["files"][number]["op"]> = { A: "create", M: "modify", D: "delete", T: "modify" };
  const expected = changes.flatMap((c): Array<[string, Plan["files"][number]["op"]]> => {
    if (c.from !== undefined) return [[c.from, "delete"], [c.path, "create"]];
    const op = OPS[c.status];
    return op ? [[c.path, op]] : [[c.path, "modify"]];
  });
  const outside: string[] = [];
  const wrongOp: string[] = [];
  for (const [p, op] of expected) {
    if (p.startsWith(runDir)) continue;
    const plannedOp = planned.get(p);
    if (plannedOp === undefined) outside.push(p);
    else if (plannedOp !== op) wrongOp.push(`${p} (${op}, planned ${plannedOp})`);
  }
  if (outside.length === 0 && wrongOp.length === 0) {
    return { name: "Stays in plan", pass: true, reason: `${changes.length} changed path(s), all in plan.json or ${runDir}` };
  }
  const parts = [
    ...(outside.length > 0 ? [`outside plan.json: ${list(outside)}`] : []),
    ...(wrongOp.length > 0 ? [`wrong op: ${list(wrongOp)}`] : []),
  ];
  return { name: "Stays in plan", pass: false, reason: parts.join("; ") };
}

function planStaysInScope({ plan, context }: RunContext): CheckResult {
  const globs = context.allowed_paths.map((g) => ({ glob: g, re: globToRegExp(g) }));
  const outside = plan.files.map((f) => f.path).filter((p) => !globs.some((g) => g.re.test(p)));
  return outside.length === 0
    ? { name: "Plan stays in scope", pass: true, reason: `${plan.files.length} planned path(s) match context.allowed_paths` }
    : { name: "Plan stays in scope", pass: false, reason: `not in context.allowed_paths: ${list(outside)}` };
}

function runDirFrozen({ git, mergeBase, planCommit, runDir }: RunContext): CheckResult {
  const frozen = [`${runDir}context.json`, `${runDir}plan.json`];
  const short = planCommit.slice(0, 7);

  const inPlanCommit = git("diff", "--name-only", mergeBase, planCommit).split("\n").filter(Boolean);
  const extra = inPlanCommit.filter((p) => !frozen.includes(p));
  const absent = frozen.filter((p) => !inPlanCommit.includes(p));
  if (extra.length > 0 || absent.length > 0) {
    const parts = [
      ...(absent.length > 0 ? [`does not add ${list(absent)}`] : []),
      ...(extra.length > 0 ? [`also changes ${list(extra)}`] : []),
    ];
    return { name: "Run dir frozen", pass: false, reason: `plan commit ${short} ${parts.join(" and ")}` };
  }

  const touched = git("log", "--name-only", "--format=commit %h", `${planCommit}..HEAD`, "--", ...frozen)
    .split("\n")
    .filter(Boolean);
  if (touched.length > 0) {
    const commits = touched.filter((l) => l.startsWith("commit ")).map((l) => l.slice("commit ".length));
    const files = Array.from(new Set(touched.filter((l) => frozen.includes(l))));
    return { name: "Run dir frozen", pass: false, reason: `changed after plan commit ${short}: ${list(files)} in ${list(commits)}` };
  }
  return { name: "Run dir frozen", pass: true, reason: `plan commit ${short} adds only context.json and plan.json; neither changes afterwards` };
}

function sharedCodeReported({ changes }: RunContext): CheckResult {
  const shared = SHARED_PATHS.map(globToRegExp);
  const hit = changes
    .flatMap((c) => [c.path, ...(c.from ? [c.from] : [])])
    .filter((p) => shared.some((re) => re.test(p)));
  return hit.length === 0
    ? { name: "Shared code reported", pass: true, reason: "no shared path touched" }
    : { name: "Shared code reported", pass: true, reason: `touched shared paths: ${list(hit)}` };
}

/** An explicit ref (`--base` or `RUN_GUARD_BASE`) must resolve; only the implicit chain falls through. */
function resolveBase(explicit: string | undefined, tryGit: (...argv: string[]) => string | null): string | null {
  const resolves = (ref: string) => tryGit("rev-parse", "--verify", "--quiet", `${ref}^{commit}`) !== null;
  if (explicit !== undefined) return resolves(explicit) ? explicit : null;
  const candidates = [
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined,
    `origin/${INTEGRATION_BRANCH}`,
    INTEGRATION_BRANCH,
  ];
  for (const ref of candidates) {
    if (ref && resolves(ref)) return ref;
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

function list(items: string[]): string {
  return items.length > 6 ? `${items.slice(0, 6).join(", ")} and ${items.length - 6} more` : items.join(", ");
}

function renderText(report: GuardReport): string {
  const lines: string[] = [];
  if (report.run) {
    const r = report.run;
    lines.push(`Run ${r.id} (${r.operation}) — base ${r.base.slice(0, 7)}, plan commit ${r.planCommit.slice(0, 7)}`);
  }
  for (const c of report.checks) {
    lines.push(c.pass ? `${c.name}: PASS — ${c.reason}` : `${c.name}: FAIL (${c.reason})`);
  }
  if (report.run) lines.push("", DELEGATED_NOTE);
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
      `Run \`${r.id}\` (${r.operation}), base \`${r.base.slice(0, 7)}\`, plan commit \`${r.planCommit.slice(0, 7)}\`.`,
    );
  } else {
    lines.push(`### Run guard: ${failed ? "failed" : "passed"}`);
  }
  lines.push("", "| Check | Result | Reason |", "| --- | --- | --- |");
  for (const c of report.checks) {
    lines.push(`| **${c.name}** | ${c.pass ? "pass" : "**fail**"} | ${c.reason.replace(/\|/g, "\\|")} |`);
  }
  if (report.run) lines.push("", `_${DELEGATED_NOTE}_`);
  return lines.join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
