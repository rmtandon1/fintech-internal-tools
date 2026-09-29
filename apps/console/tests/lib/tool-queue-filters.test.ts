import { describe, expect, it } from "vitest";
import { refundTool } from "@console/tool-refunds";
import { resolveQueueFilters } from "@/lib/tool-queue-filters";
import { analyst, manager } from "../helpers/harness";

describe("tool queue filters", () => {
  it("applies the actor's defaults when the URL has no filter", () => {
    expect(resolveQueueFilters(refundTool, analyst, {})).toEqual({
      filters: { queue: "analyst" },
      filterQuery: { queue: "analyst" },
    });
    expect(resolveQueueFilters(refundTool, manager, {})).toEqual({
      filters: { queue: "manager" },
      filterQuery: { queue: "manager" },
    });
  });

  it("preserves an explicit All selection instead of restoring the actor default", () => {
    expect(resolveQueueFilters(refundTool, analyst, { queue: "all" })).toEqual({
      filters: {},
      filterQuery: { queue: "all" },
    });
  });
});
