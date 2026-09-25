import { redirect } from "next/navigation";
import { ConstantEditor } from "@/components/constant-editor";
import { Panel } from "@/components/panel";
import { listConstants } from "@console/engine/policy/constants";
import { currentActor } from "@/lib/session";

export default async function PolicyConstantsPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") redirect("/");

  const constants = listConstants();

  return (
    <Panel
      className="h-full"
      title={
        <span>
          Policy constants · <span className="tabular-nums">{constants.length}</span>
        </span>
      }
      bodyClassName="space-y-2 p-3"
    >
      {constants.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No constants registered yet — they arrive with the tools that use them.
        </p>
      ) : (
        constants.map((constant) => (
          <ConstantEditor key={constant.key} constant={constant} />
        ))
      )}
    </Panel>
  );
}
