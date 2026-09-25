import { describe, expect, it } from "vitest";
import { parseGitHubRepository } from "@/lib/bridge";

describe("GitHub repository from the checkout's remote", () => {
  it("reads owner/repo from https and ssh remotes", () => {
    expect(parseGitHubRepository("https://github.com/rmtandon1/buy-v-build-cog-demo.git\n")).toBe(
      "rmtandon1/buy-v-build-cog-demo",
    );
    expect(parseGitHubRepository("https://github.com/rmtandon1/buy-v-build-cog-demo")).toBe(
      "rmtandon1/buy-v-build-cog-demo",
    );
    expect(parseGitHubRepository("git@github.com:acme/ops.console.git")).toBe("acme/ops.console");
  });

  it("returns null for other hosts, including ones that merely contain github.com", () => {
    expect(parseGitHubRepository("https://gitlab.com/acme/ops.git")).toBeNull();
    expect(parseGitHubRepository("https://notgithub.com/acme/ops.git")).toBeNull();
    expect(parseGitHubRepository("https://proxy.example/github.com/acme/ops.git")).toBeNull();
    expect(parseGitHubRepository("https://github.com.evil.test/acme/ops.git")).toBeNull();
  });
});
