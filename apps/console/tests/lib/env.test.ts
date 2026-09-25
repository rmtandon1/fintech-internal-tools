import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRepoEnv } from "@/lib/env";

const KEYS = ["ENV_TEST_FROM_FILE", "ENV_TEST_SHELL_WINS"];

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("repo-root .env", () => {
  it("loads the file once, and a value already in the environment wins", () => {
    const root = mkdtempSync(join(tmpdir(), "env-root-"));
    writeFileSync(join(root, ".env"), "ENV_TEST_FROM_FILE=file\nENV_TEST_SHELL_WINS=file\n");
    process.env.ENV_TEST_SHELL_WINS = "shell";

    loadRepoEnv(root);
    expect(process.env.ENV_TEST_FROM_FILE).toBe("file");
    expect(process.env.ENV_TEST_SHELL_WINS).toBe("shell");

    delete process.env.ENV_TEST_FROM_FILE;
    loadRepoEnv(root);
    expect(process.env.ENV_TEST_FROM_FILE).toBeUndefined();
  });

  it("is a no-op without a .env file", () => {
    const root = mkdtempSync(join(tmpdir(), "env-empty-"));
    expect(() => loadRepoEnv(root)).not.toThrow();
  });
});
