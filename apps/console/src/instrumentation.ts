export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadRepoEnv } = await import("@/lib/env");
    loadRepoEnv();
    const { registerToolConstants } = await import("@/lib/register-tool-constants");
    registerToolConstants();
  }
}
