export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerConstants } = await import("@console/engine/policy/register");
  const { TOOLS } = await import("@/registry");

  for (const tool of TOOLS) {
    if (tool.constants?.length) registerConstants(tool.constants);
  }
}
