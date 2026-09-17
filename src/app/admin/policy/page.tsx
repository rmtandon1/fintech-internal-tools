import { notFound } from "next/navigation";
import { ConstantEditor } from "@/components/constant-editor";
import { Card, CardContent } from "@/components/ui/card";
import { listConstants } from "@/engine/policy/constants";
import { currentActor } from "@/lib/session";

export default async function PolicyConstantsPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") notFound();

  const constants = listConstants();

  return (
    <div className="max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Policy constants</h1>
        <p className="text-sm text-muted-foreground">
          Thresholds are read from here on every policy evaluation, so a change takes
          effect on the next action. Every edit is audited.
        </p>
      </header>

      {constants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No constants registered yet — they arrive with the tools that use them.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {constants.map((constant) => (
            <ConstantEditor key={constant.key} constant={constant} />
          ))}
        </div>
      )}
    </div>
  );
}
