export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerToolConstants } = await import("@/lib/register-tool-constants");
    registerToolConstants();
  }
}
