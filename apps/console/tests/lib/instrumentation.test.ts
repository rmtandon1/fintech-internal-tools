import { beforeAll, describe, expect, it, vi } from "vitest";
import { listConstants } from "@console/engine/policy/constants";
import { registerConstants } from "@console/engine/policy/register";
import { setConstant } from "@console/engine/policy/set-constant";
import { register } from "@/instrumentation";
import { TOOLS } from "@/registry";
import { admin, setupHarness } from "../helpers/harness";

beforeAll(() => setupHarness());

describe("startup constant registration", () => {
  it("installs newly declared constants without replacing edited values", async () => {
    for (const tool of TOOLS) {
      if (tool.constants?.length) registerConstants(tool.constants);
    }

    const tool = TOOLS.find((declaration) =>
      declaration.constants?.some((constant) => typeof constant.value === "number"),
    );
    const existing = tool?.constants?.find(
      (constant) => typeof constant.value === "number",
    );
    if (!tool || !existing || typeof existing.value !== "number") {
      throw new Error("expected a registered numeric constant");
    }

    const editedValue = existing.value + 1;
    expect(setConstant(admin, existing.key, String(editedValue)).ok).toBe(true);

    const newConstant = {
      key: `${tool.name}.added_after_seed`,
      value: 42,
      type: "number" as const,
      description: "Threshold introduced after seeding",
      tool: tool.name,
    };
    tool.constants?.push(newConstant);
    try {
      vi.stubEnv("NEXT_RUNTIME", "edge");
      await register();
      expect(listConstants().find((row) => row.key === newConstant.key)).toBeUndefined();

      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      await register();
      await register();

      expect(listConstants().find((row) => row.key === newConstant.key)).toMatchObject({
        value: 42,
        updatedBy: "system",
      });
      expect(listConstants().find((row) => row.key === existing.key)).toMatchObject({
        value: editedValue,
        updatedBy: admin.id,
      });
    } finally {
      tool.constants?.splice(tool.constants.indexOf(newConstant), 1);
      vi.unstubAllEnvs();
    }
  });
});
