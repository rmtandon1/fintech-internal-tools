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

  it("returns null for other hosts", () => {
    expect(parseGitHubRepository("https://gitlab.com/acme/ops.git")).toBeNull();
  });
});
