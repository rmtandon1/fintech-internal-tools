import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StructuredOutput } from "@console/tool-automation/run-files";

const repo = resolve(__dirname, "../../../..");
const playbook = readFileSync(resolve(repo, ".devin/run-protocol.playbook.md"), "utf8");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root: string, message: string): void {
  git(root, "add", "-A");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", message);
}

function write(root: string, file: string, body: string): void {
  mkdirSync(resolve(root, file, ".."), { recursive: true });
  writeFileSync(resolve(root, file), body);
}

describe("run playbook contract", () => {
  it("names only fields in the StructuredOutput zod schema", () => {
    const section = playbook.split("## Structured output\n")[1].split("\n## ")[0];
    const fields = [...section.matchAll(/`([a-z][a-z_]+)`/g)].map((match) => match[1]);
    expect(fields.length).toBeGreaterThan(10);
    for (const field of fields) expect(Object.keys(StructuredOutput.shape)).toContain(field);
  });

  it("uses the guard names printed by the CLI", () => {
    const section = playbook.split("## Local guard checks\n")[1].split("The console separately checks")[0];
    const names = [...section.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]);
    const output = execFileSync("pnpm", ["exec", "tsx", "scripts/run-guard.ts", "--list-checks"], {
      cwd: repo,
      encoding: "utf8",
    }).trim().split("\n");
    expect(names).toEqual(output);
  });

  it("rejects unplanned edits, test removal and type escapes in a run", () => {
    const root = mkdtempSync(join(tmpdir(), "run-guard-"));
    directories.push(root);
    git(root, "init");
    write(root, "tools/refunds/src/rule.ts", "export const rule = 1;\n");
    write(root, "apps/console/tests/tools/rule.test.ts", 'it("existing", () => {});\nit("second", () => {});\n');
    commit(root, "base");
    const base = git(root, "rev-parse", "HEAD");
    write(root, "runs/run-1/context.json", JSON.stringify({
      run_id: "run-1",
      kind: "IMPLEMENTATION/ADDITION",
      spec: "RULE.md",
      intent: "Update rule",
      requested_by: "admin",
      base: { branch: "integration", commit: base },
      scope: ["tools/refunds/**", "apps/console/tests/tools/*.test.ts"],
      constants: {},
      evidence: { cluster: "example", rows: [] },
      reverses: null,
      audit_head: { seq: 1, rowHash: "a" },
    }));
    write(root, "runs/run-1/plan.json", JSON.stringify({
      files: [
        { path: "tools/refunds/src/rule.ts", op: "modify", reason: "rule" },
        { path: "apps/console/tests/tools/rule.test.ts", op: "modify", reason: "test" },
      ],
      reuses: [],
      acceptance: ["existing"],
    }));
    commit(root, "plan");
    write(root, "tools/refunds/src/rule.ts", "export const rule: any = 2;\n");
    write(root, "apps/console/tests/tools/rule.test.ts", 'it("existing", () => {});\n');
    write(root, "notes.txt", "out of scope\n");
    commit(root, "edit");

    const result = spawnSync(resolve(repo, "node_modules/.bin/tsx"), [
      resolve(repo, "scripts/run-guard.ts"), "--base", base,
    ], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout.split("\n").filter((line) => line.includes(": FAIL")).map((line) => line.split(":")[0])).toEqual([
      "Stays in plan",
      "Tests never shrink",
      "No type escapes",
    ]);

    write(root, "tools/refunds/src/rule.ts", "export const rule = 2;\n");
    write(root, "apps/console/tests/tools/rule.test.ts", 'it("existing", () => {});\nit("second", () => {});\n');
    rmSync(resolve(root, "notes.txt"));
    commit(root, "correct edit");
    const corrected = spawnSync(resolve(repo, "node_modules/.bin/tsx"), [
      resolve(repo, "scripts/run-guard.ts"), "--base", base,
    ], { cwd: root, encoding: "utf8" });
    expect(corrected.status).toBe(0);
    expect(corrected.stdout).toContain("Run dir frozen: PASS");
    expect(corrected.stdout).toContain("Plan stays in scope: PASS");

    rmSync(resolve(root, "tools/refunds/src/rule.ts"));
    commit(root, "delete modified file");
    const deleted = spawnSync(resolve(repo, "node_modules/.bin/tsx"), [
      resolve(repo, "scripts/run-guard.ts"), "--base", base,
    ], { cwd: root, encoding: "utf8" });
    expect(deleted.status).toBe(1);
    expect(deleted.stdout).toContain("Stays in plan: FAIL");
    write(root, "tools/refunds/src/rule.ts", "export const rule = 2;\n");
    commit(root, "restore modified file");

    const plan = resolve(root, "runs/run-1/plan.json");
    writeFileSync(plan, `${readFileSync(plan, "utf8")}\n`);
    commit(root, "mutate plan");
    const mutated = spawnSync(resolve(repo, "node_modules/.bin/tsx"), [
      resolve(repo, "scripts/run-guard.ts"), "--base", base,
    ], { cwd: root, encoding: "utf8" });
    expect(mutated.status).toBe(1);
    expect(mutated.stdout).toContain("Run dir frozen: FAIL");
  });

  it("requires a reversal to change the target while preserving later edits", () => {
    const root = mkdtempSync(join(tmpdir(), "run-reversal-"));
    directories.push(root);
    git(root, "init");
    write(root, "tools/refunds/src/rule.ts", "export const rule = old;\n");
    commit(root, "original rule");
    write(root, "tools/refunds/src/rule.ts", "export const rule = hold;\n");
    commit(root, "implementation");
    const target = git(root, "rev-parse", "HEAD");
    write(root, "tools/refunds/src/rule.ts", "export const rule = hold || partialDelivery;\n");
    commit(root, "later work");
    const base = git(root, "rev-parse", "HEAD");
    write(root, "runs/run-2/context.json", JSON.stringify({
      run_id: "run-2",
      kind: "REVERSAL",
      spec: "RULE.md",
      intent: "Undo hold",
      requested_by: "admin",
      base: { branch: "integration", commit: base },
      scope: ["tools/refunds/**"],
      constants: {},
      evidence: { cluster: "example", rows: [] },
      reverses: { run_id: "run-1", merge_commit: target, constants_at_dispatch: null },
      audit_head: { seq: 1, rowHash: "a" },
    }));
    write(root, "runs/run-2/plan.json", JSON.stringify({
      files: [
        { path: "tools/refunds/src/rule.ts", op: "modify", reason: "undo the hold" },
        { path: "tools/refunds/src/unrelated.ts", op: "create", reason: "extra edit" },
      ],
      reuses: [],
      acceptance: [],
    }));
    commit(root, "plan");

    const check = () => spawnSync(resolve(repo, "node_modules/.bin/tsx"), [
      resolve(repo, "scripts/run-guard.ts"), "--base", base,
    ], { cwd: root, encoding: "utf8" });
    expect(check().stdout).toContain("Only undo: FAIL (tools/refunds/src/rule.ts)");

    write(root, "tools/refunds/src/rule.ts", "export const rule = old || partialDelivery;\n");
    commit(root, "undo hold and keep later work");
    const valid = check();
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("Only undo: PASS");

    write(root, "tools/refunds/src/unrelated.ts", "export const unrelated = true;\n");
    commit(root, "add unrelated behavior");
    expect(check().stdout).toContain("Only undo: FAIL (tools/refunds/src/unrelated.ts)");
  });
});
