import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Drives `scripts/run-guard.ts` against throwaway git repositories: a base
 * branch with a tool, a test file and an engine file, then a run branch whose
 * first commit adds `runs/<run_id>/{context,plan}.json` and whose later
 * commits make the edits each case needs.
 */

const REPO_ROOT = resolve(__dirname, "../../../..");
const TSX = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const GUARD = join(REPO_ROOT, "scripts", "run-guard.ts");
const BASE_BRANCH = "cognition-dashboard-devin-integration";
const RUN_ID = "01K5Z3Q8M4V7N2X9C6B1D0F3GH";
const RUN_DIR = `runs/${RUN_ID}`;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "guard test",
  GIT_AUTHOR_EMAIL: "guard@example.test",
  GIT_COMMITTER_NAME: "guard test",
  GIT_COMMITTER_EMAIL: "guard@example.test",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const TOOL_FILE = "tools/refunds/src/index.ts";
const TEST_FILE = "apps/console/tests/tools/refunds.test.ts";
const ENGINE_FILE = "packages/engine/src/policy.ts";

const BASE_TEST = [
  'import { describe, expect, it } from "vitest";',
  "",
  'describe("refunds", () => {',
  '  it("applies small refunds", () => { expect(1).toBe(1); });',
  '  it("holds large refunds", () => { expect(2).toBe(2); });',
  "});",
  "",
].join("\n");

const BASE_FILES: Record<string, string> = {
  [TOOL_FILE]: 'export const refundTool = { id: "refunds" };\n',
  [TEST_FILE]: BASE_TEST,
  [ENGINE_FILE]: "export const policy = 1;\n",
  "package.json": '{ "name": "fixture" }\n',
};

interface ContextOverrides {
  kind?: string;
  scope?: string[];
}

interface PlanOverrides {
  files?: Array<{ path: string; op: "create" | "modify" | "delete"; reason: string }>;
  removed_tests?: Array<{ file: string; name: string }>;
}

const DEFAULT_SCOPE = ["tools/refunds/**", "apps/console/tests/**", `${RUN_DIR}/**`];

function contextJson(o: ContextOverrides = {}): string {
  return JSON.stringify(
    {
      run_id: RUN_ID,
      kind: o.kind ?? "IMPLEMENTATION/ADDITION",
      spec: "REFUND_CLUSTERING_HOLD.md",
      intent: "Hold clustered refunds.",
      requested_by: "refunds_manager",
      base: { branch: BASE_BRANCH, commit: "1a67f60a1a67f60a1a67f60a1a67f60a1a67f60a" },
      scope: o.scope ?? DEFAULT_SCOPE,
      constants: { "refunds.manager_approval_usd_minor": 50000 },
      evidence: { cluster: "merchant_not_received:Kestrel Outdoors", rows: [] },
      reverses: null,
      audit_head: { seq: 1, rowHash: "abc" },
    },
    null,
    2,
  );
}

function planJson(o: PlanOverrides = {}): string {
  return JSON.stringify(
    {
      files: o.files ?? [
        { path: TOOL_FILE, op: "modify", reason: "register the rule" },
        { path: TEST_FILE, op: "modify", reason: "assert the rule" },
      ],
      reuses: [],
      acceptance: ["holds clustered refunds"],
      ...(o.removed_tests ? { removed_tests: o.removed_tests } : {}),
    },
    null,
    2,
  );
}

class Fixture {
  readonly dir: string;

  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), "run-guard-"));
    this.git("init", "-q", "-b", BASE_BRANCH);
    this.write(BASE_FILES);
    this.commit("base");
  }

  git(...args: string[]): string {
    return execFileSync("git", args, { cwd: this.dir, encoding: "utf8", env: GIT_ENV }).trimEnd();
  }

  write(files: Record<string, string>): void {
    for (const [path, content] of Object.entries(files)) {
      const full = join(this.dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }

  remove(path: string): void {
    rmSync(join(this.dir, path));
  }

  commit(message: string): void {
    this.git("add", "-A");
    this.git("commit", "-q", "-m", message);
  }

  /** Cuts the run branch and lands the plan commit. */
  startRun(context: ContextOverrides = {}, plan: PlanOverrides = {}): this {
    this.git("switch", "-q", "-c", `devin/${RUN_ID}`);
    this.write({ [`${RUN_DIR}/context.json`]: contextJson(context), [`${RUN_DIR}/plan.json`]: planJson(plan) });
    this.commit("plan");
    return this;
  }

  /** The edit every passing case makes: one line in the tool plus one new test. */
  editInPlan(): this {
    this.write({
      [TOOL_FILE]: 'export const refundTool = { id: "refunds", rules: ["clustering_hold"] };\n',
      [TEST_FILE]: BASE_TEST.replace(
        "});\n",
        '  it("holds clustered refunds", () => { expect(3).toBe(3); });\n});\n',
      ),
    });
    this.commit("edit");
    return this;
  }

  guard(): { status: number; out: string } {
    const result = spawnSync(TSX, [GUARD, "--base", BASE_BRANCH], { cwd: this.dir, encoding: "utf8", env: GIT_ENV });
    if (result.error) throw result.error;
    return { status: result.status ?? -1, out: result.stdout + result.stderr };
  }

  markdown(): { status: number; out: string } {
    const result = spawnSync(TSX, [GUARD, "--base", BASE_BRANCH, "--markdown"], { cwd: this.dir, encoding: "utf8", env: GIT_ENV });
    if (result.error) throw result.error;
    return { status: result.status ?? -1, out: result.stdout };
  }
}

const fixtures: Fixture[] = [];
function fixture(): Fixture {
  const f = new Fixture();
  fixtures.push(f);
  return f;
}

afterAll(() => {
  for (const f of fixtures) rmSync(f.dir, { recursive: true, force: true });
});

function line(out: string, check: string): string {
  const found = out.split("\n").find((l) => l.includes(` ${check} `));
  if (!found) throw new Error(`no line for "${check}" in:\n${out}`);
  return found;
}

describe("run-guard", () => {
  it("exits 0 with 'No run on this branch' when no plan.json is added", () => {
    const f = fixture();
    f.git("switch", "-q", "-c", "devin/plain-feature");
    f.write({ [TOOL_FILE]: "export const refundTool = { id: 'refunds', v: 2 };\n" });
    f.commit("feature");
    const { status, out } = f.guard();
    expect(status).toBe(0);
    expect(out).toContain("No run on this branch");
  });

  it("passes every implemented check for an edit inside the plan", () => {
    const f = fixture().startRun().editInPlan();
    const { status, out } = f.guard();
    expect(status).toBe(0);
    for (const name of [
      "Stays in plan",
      "Plan stays in scope",
      "Context untouched",
      "Engine untouched",
      "Tests never shrink",
      "No type escapes",
    ]) {
      expect(line(out, name)).toMatch(/^PASS/);
    }
    for (const name of ["Only undo", "Seed is not state", "Humans approve", "Engine owner approves", "No live writes"]) {
      expect(line(out, name)).toContain("enforced by review/GitHub/playbook");
    }
  });

  describe("Stays in plan", () => {
    it("fails when a file outside plan.json changes", () => {
      const f = fixture().startRun().editInPlan();
      f.write({ "tools/kyc/src/index.ts": "export const kycTool = 1;\n" });
      f.commit("stray");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Stays in plan")).toMatch(/^FAIL.*tools\/kyc\/src\/index\.ts/);
    });

    it("allows other files under runs/<run_id>/", () => {
      const f = fixture().startRun().editInPlan();
      f.write({ [`${RUN_DIR}/replay.json`]: "[]\n" });
      f.commit("replay");
      const { status, out } = f.guard();
      expect(status).toBe(0);
      expect(line(out, "Stays in plan")).toMatch(/^PASS/);
      expect(line(out, "Context untouched")).toMatch(/^PASS/);
    });
  });

  describe("Plan stays in scope", () => {
    it("fails when a planned path matches no scope glob", () => {
      const f = fixture()
        .startRun({}, { files: [{ path: TOOL_FILE, op: "modify", reason: "x" }, { path: TEST_FILE, op: "modify", reason: "x" }, { path: "tools/kyc/src/index.ts", op: "create", reason: "x" }] })
        .editInPlan();
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Plan stays in scope")).toMatch(/^FAIL.*tools\/kyc\/src\/index\.ts/);
    });

    it("passes when every planned path matches a glob", () => {
      const f = fixture().startRun({ scope: ["tools/*/src/*.ts", "apps/console/tests/tools/refunds.test.ts", `${RUN_DIR}/**`] }).editInPlan();
      const { status, out } = f.guard();
      expect(status).toBe(0);
      expect(line(out, "Plan stays in scope")).toMatch(/^PASS/);
    });
  });

  describe("Context untouched", () => {
    it("fails when plan.json changes after the plan commit", () => {
      const f = fixture().startRun().editInPlan();
      f.write({ [`${RUN_DIR}/plan.json`]: planJson({ files: [{ path: TOOL_FILE, op: "modify", reason: "x" }, { path: TEST_FILE, op: "modify", reason: "x" }, { path: "tools/kyc/src/index.ts", op: "create", reason: "widened" }] }) });
      f.commit("widen plan");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Context untouched")).toMatch(/^FAIL.*plan\.json/);
    });

    it("fails when context.json changes after the plan commit", () => {
      const f = fixture().startRun().editInPlan();
      f.write({ [`${RUN_DIR}/context.json`]: contextJson({ scope: [...DEFAULT_SCOPE, "tools/kyc/**"] }) });
      f.commit("widen context");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Context untouched")).toMatch(/^FAIL.*context\.json/);
    });
  });

  describe("Engine untouched", () => {
    it("fails when a rule-scope run changes an engine file, even one in its plan", () => {
      const f = fixture()
        .startRun({}, { files: [{ path: TOOL_FILE, op: "modify", reason: "x" }, { path: TEST_FILE, op: "modify", reason: "x" }, { path: ENGINE_FILE, op: "modify", reason: "x" }] })
        .editInPlan();
      f.write({ [ENGINE_FILE]: "export const policy = 2;\n" });
      f.commit("engine");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Engine untouched")).toMatch(/^FAIL.*packages\/engine\/src\/policy\.ts/);
    });

    it("fails when a rule-scope run edits the guard itself", () => {
      const f = fixture().startRun({}, { files: [{ path: TOOL_FILE, op: "modify", reason: "x" }, { path: TEST_FILE, op: "modify", reason: "x" }, { path: "scripts/run-guard.ts", op: "create", reason: "x" }] }).editInPlan();
      f.write({ "scripts/run-guard.ts": "process.exit(0);\n" });
      f.commit("guard");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Engine untouched")).toMatch(/^FAIL.*scripts\/run-guard\.ts/);
    });

    it("is waived for an engine-scope run", () => {
      const ENGINE_SCOPE = [
        "packages/engine/**",
        "packages/db/**",
        "packages/db-core/**",
        "packages/db-write/**",
        "packages/permissions/**",
        "apps/console/drizzle/**",
        "apps/console/src/app/actions.ts",
        "apps/console/src/components/**",
        "AGENTS.md",
      ];
      const f = fixture()
        .startRun(
          { scope: [...DEFAULT_SCOPE, ...ENGINE_SCOPE] },
          { files: [{ path: TOOL_FILE, op: "modify", reason: "x" }, { path: TEST_FILE, op: "modify", reason: "x" }, { path: ENGINE_FILE, op: "modify", reason: "x" }] },
        )
        .editInPlan();
      f.write({ [ENGINE_FILE]: "export const policy = 2;\n" });
      f.commit("engine");
      const { status, out } = f.guard();
      expect(status).toBe(0);
      expect(out).toContain("scope engine");
      expect(line(out, "Engine untouched")).toMatch(/^PASS.*engine scope/);
    });
  });

  describe("Tests never shrink", () => {
    it("fails when a test file loses an it()", () => {
      const f = fixture().startRun();
      f.write({ [TEST_FILE]: BASE_TEST.replace('  it("holds large refunds", () => { expect(2).toBe(2); });\n', "") });
      f.commit("drop test");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Tests never shrink")).toMatch(/^FAIL.*refunds\.test\.ts: 2 → 1/);
    });

    it("fails when a test file is deleted", () => {
      const f = fixture().startRun({}, { files: [{ path: TEST_FILE, op: "delete", reason: "x" }] });
      f.remove(TEST_FILE);
      f.commit("delete tests");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Tests never shrink")).toMatch(/^FAIL.*refunds\.test\.ts deleted/);
    });

    it("fails when .skip, .only or .todo is added", () => {
      const f = fixture().startRun();
      f.write({ [TEST_FILE]: BASE_TEST.replace('it("holds large refunds"', 'it.skip("holds large refunds"') });
      f.commit("skip");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Tests never shrink")).toMatch(/^FAIL.*adds \.skip\/\.only\/\.todo/);
    });

    it("lets a REMOVAL delete exactly the tests listed in plan.removed_tests", () => {
      const f = fixture().startRun(
        { kind: "IMPLEMENTATION/REMOVAL" },
        { files: [{ path: TOOL_FILE, op: "modify", reason: "x" }, { path: TEST_FILE, op: "modify", reason: "x" }], removed_tests: [{ file: TEST_FILE, name: "holds large refunds" }] },
      );
      f.write({ [TEST_FILE]: BASE_TEST.replace('  it("holds large refunds", () => { expect(2).toBe(2); });\n', "") });
      f.commit("remove rule test");
      const { status, out } = f.guard();
      expect(status).toBe(0);
      expect(line(out, "Tests never shrink")).toMatch(/^PASS/);
    });

    it("fails a REMOVAL that deletes a test not listed in plan.removed_tests", () => {
      const f = fixture().startRun(
        { kind: "IMPLEMENTATION/REMOVAL" },
        { files: [{ path: TOOL_FILE, op: "modify", reason: "x" }, { path: TEST_FILE, op: "modify", reason: "x" }], removed_tests: [{ file: TEST_FILE, name: "holds large refunds" }] },
      );
      f.write({ [TEST_FILE]: BASE_TEST.replace('  it("applies small refunds", () => { expect(1).toBe(1); });\n', "") });
      f.commit("remove wrong test");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      expect(line(out, "Tests never shrink")).toMatch(/^FAIL.*not in plan\.removed_tests.*applies small refunds/);
    });
  });

  describe("No type escapes", () => {
    it("fails on added any, @ts-ignore, @ts-expect-error, eslint-disable and as unknown as", () => {
      const f = fixture().startRun();
      f.write({
        [TOOL_FILE]: [
          "export const a: any = 1;",
          "// @ts-ignore",
          "// @ts-expect-error",
          "/* eslint-disable */",
          'export const b = "x" as unknown as number;',
          'export const refundTool = { id: "refunds" };',
          "",
        ].join("\n"),
      });
      f.commit("escapes");
      const { status, out } = f.guard();
      expect(status).toBe(1);
      const l = line(out, "No type escapes");
      expect(l).toMatch(/^FAIL/);
      for (const label of ["(any)", "(@ts-ignore)", "(@ts-expect-error)", "(eslint-disable)", "(as unknown as)"]) {
        expect(l).toContain(label);
      }
    });

    it("ignores 'any' in identifiers and strings", () => {
      const f = fixture().startRun();
      f.write({
        [TOOL_FILE]: 'export const refundTool = { id: "refunds", anyway: "for any merchant", company: 1 };\n',
      });
      f.commit("prose");
      const { status, out } = f.guard();
      expect(status).toBe(0);
      expect(line(out, "No type escapes")).toMatch(/^PASS/);
    });
  });

  it("renders the report as a Markdown table with --markdown", () => {
    const f = fixture().startRun().editInPlan();
    f.write({ "tools/kyc/src/index.ts": "export const kycTool = 1;\n" });
    f.commit("stray");
    const { status, out } = f.markdown();
    expect(status).toBe(1);
    expect(out).toContain("<!-- run-guard -->");
    expect(out).toContain("### Run guard: failed");
    expect(out).toMatch(/\| \*\*Stays in plan\*\* \| \*\*fail\*\* \|/);
    expect(out).toMatch(/\| \*\*Humans approve\*\* \| n\/a \| enforced by review\/GitHub\/playbook \|/);
  });
});
