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
import { buildHandoffOffer } from "@/lib/handoff";
import { currentActor } from "@/lib/session";

export default async function PolicyConstantsPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") redirect("/");

  const constants = listConstants();

  const deps = bridgeDeps();

  const action = (
    spec: RunnableSpec,
    kind: RunKind,
    label: string,
  ): RuleRow["actions"][number] => {
    if (!spec.kinds.includes(kind)) {
      return { kind, label, enabled: false, reason: `${spec.file} offers no ${kind} run` };
    }
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
      ],
    };
  });

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
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Rules
        </p>
        <RulesCard rows={rules} />
      </div>
      {constants.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No settings yet. Each tool adds its own.
        </p>
      ) : (
        constants.map((constant) => (
          <ConstantEditor key={constant.key} constant={constant} />
        ))
      )}
    </Panel>
  );
}
