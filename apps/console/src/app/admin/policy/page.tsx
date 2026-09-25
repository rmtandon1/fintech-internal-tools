import { notFound } from "next/navigation";
import { ConstantEditor } from "@/components/constant-editor";
import { Panel } from "@/components/panel";
import { RulesCard, type RuleRow } from "@/components/rules-card";
import { listConstants } from "@console/engine/policy/constants";
import { SPECS, type RunKind } from "@console/tool-automation";
import { currentActor } from "@/lib/session";

export default async function PolicyConstantsPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") notFound();

  const constants = listConstants();

  const rules: RuleRow[] = SPECS.map((spec) => {
    const action = (kind: RunKind, label: string): RuleRow["actions"][number] =>
      spec.kinds.includes(kind)
        ? { kind, label, enabled: false, reason: "Not wired to a trigger here" }
        : {
            kind,
            label,
            enabled: false,
            reason: `${spec.file} offers no ${kind} run`,
          };
    return {
      spec: spec.file,
      actions: [
        action("IMPLEMENTATION/CHANGE", "Ask Devin to change this rule"),
        action("IMPLEMENTATION/REMOVAL", "Ask Devin to remove this rule"),
      ],
    };
  });

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
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Rules
        </p>
        <RulesCard rows={rules} />
      </div>
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
