import { databasePath } from "@console/db-core";
import { registerConstants } from "@console/engine/policy/register";
import { TOOLS } from "@/registry";

/**
 * Seeds every registered tool. Tools own their own demo data and thresholds,
 * so adding a tool never means editing this script.
 */
for (const tool of TOOLS) {
  if (tool.constants?.length) registerConstants(tool.constants);
  tool.seed?.();
  console.log(`seeded ${tool.name}`);
}

console.log(
  TOOLS.length === 0
    ? `no tools registered yet — ${databasePath} is ready and empty`
    : `seeded ${TOOLS.length} tool(s) into ${databasePath}`,
);
