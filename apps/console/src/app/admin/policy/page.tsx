import { redirect } from "next/navigation";
import { ConstantEditor } from "@/components/constant-editor";
import { Panel } from "@/components/panel";
import { RulesCard, type RuleRow } from "@/components/rules-card";
import { listConstants } from "@console/engine/policy/constants";
import { ALL_ROLES, roleLabel } from "@console/permissions";
import {
  kindsStartableBy,
  roleMayStart,
  SPECS,
  type RunKind,
  type RunnableSpec,
} from "@console/tool-automation";
import { bridgeDeps } from "@/lib/bridge";
import { devinMode } from "@/lib/devin-status";
import { buildHandoffOffer } from "@/lib/handoff";
import { currentActor } from "@/lib/session";
import { humanize } from "@console/ui/format";

export default async function PolicyConstantsPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") redirect("/");

  const constants = listConstants();

  const deps = bridgeDeps();

  const action = (
    spec: RunnableSpec,
    kind: RunKind,
    label: string,
  ): RuleRow["actions"][number] | null => {
    // A spec that never offers this run kind gets no button at all.
    if (!spec.kinds.includes(kind)) return null;
    if (!kindsStartableBy(actor.role, spec).includes(kind)) {
      const who = ALL_ROLES.filter((role) => roleMayStart(role, spec, kind)).map(roleLabel);
      return { kind, label, enabled: false, reason: `Only ${who.join(", ")} may start this run` };
    }
    try {
      const offer = buildHandoffOffer(spec, kind, actor, { clusterKey: "", evidenceIds: [] }, deps);
      return offer
        ? { kind, label, enabled: true, offer }
        : { kind, label, enabled: false, reason: "Context unavailable" };
    } catch {
      return { kind, label, enabled: false, reason: "Context unavailable" };
    }
  };

  const rules: RuleRow[] = SPECS.map((spec) => {
    return {
      spec: spec.file,
      actions: [
        action(spec, "IMPLEMENTATION/CHANGE", "Ask Devin to change this rule"),
        action(spec, "IMPLEMENTATION/REMOVAL", "Ask Devin to remove this rule"),
      ].filter((a): a is RuleRow["actions"][number] => a !== null),
    };
  }).filter((row) => row.actions.length > 0);

  const tools = [...new Set(constants.map((c) => c.tool))];

  return (
    <Panel
      className="h-full"
      title={
        <span>
          Rule settings · <span className="tabular-nums">{constants.length}</span>
        </span>
      }
      bodyClassName="space-y-2 p-3"
    >
      {rules.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Rules
          </p>
          <RulesCard rows={rules} devinConnected={devinMode() === "live"} />
        </div>
      ) : null}
      {constants.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No settings yet. Each tool adds its own.
        </p>
      ) : (
        tools.map((tool) => (
          <div key={tool} className="space-y-2">
            <p className="pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {humanize(tool)}
            </p>
            {constants
              .filter((c) => c.tool === tool)
              .map((constant) => (
                <ConstantEditor key={constant.key} constant={constant} />
              ))}
          </div>
        ))
      )}
    </Panel>
  );
}
