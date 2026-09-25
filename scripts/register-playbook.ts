import { registerPlaybook } from "../tools/automation/src/playbook-registration";

registerPlaybook(process.env.DEVIN_API_KEY ?? "", process.env.DEVIN_ORG_ID ?? "")
  .then((id) => console.log(id))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
