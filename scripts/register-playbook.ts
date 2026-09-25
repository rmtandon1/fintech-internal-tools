import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveOrgId } from "../tools/automation/src/devin-api";
import { registerPlaybook } from "../tools/automation/src/playbook-registration";

// The same repo-root `.env` the console reads; the shell environment wins.
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main(): Promise<string> {
  const apiKey = process.env.DEVIN_API_KEY ?? "";
  if (!apiKey) throw new Error("Set DEVIN_API_KEY in .env before registering the playbook");
  const orgId = await resolveOrgId({ apiKey, orgId: process.env.DEVIN_ORG_ID || undefined }, fetch);
  return registerPlaybook(apiKey, orgId);
}

main()
  .then((id) => console.log(id))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
