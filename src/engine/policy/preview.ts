import type {
  ActionDecl,
  Actor,
  GovernedRecord,
  PolicyDecision,
  RuleContext,
  ToolDeclaration,
} from "@/engine/types";
import { loadConstants } from "./constants";
import { evaluatePolicy } from "./evaluate";

export interface ActionPreview {
  action: string;
  label: string;
  description?: string;
  tone: "default" | "destructive" | "primary";
  /** False when the role or the record status rules the action out entirely. */
  offered: boolean;
  unavailableReason?: string;
  /** True when the action's input has not been supplied or does not parse. */
  needsInput?: boolean;
  decision: PolicyDecision | null;
  inputFields: InputFieldDesc[];
}

export interface InputFieldDesc {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  optional: boolean;
  options?: string[];
}

/**
 * The live policy outcome for each action on a record, for this actor. The UI
 * shows it before anything is clicked; it runs the same rules the write path
 * runs, so "Allowed" here means the same thing it means there.
 *
 * Rules are only evaluated once the supplied input parses: a rule reading a
 * field the form has not filled in yet would otherwise throw, or return an
 * outcome the real write path would never produce.
 */
export function previewActions(
  decl: ToolDeclaration,
  record: GovernedRecord,
  actor: Actor,
  inputs: Record<string, unknown> = {},
): ActionPreview[] {
  const constants = loadConstants();
  const status = String(record[decl.statusField]);

  return decl.actions.map((action: ActionDecl<GovernedRecord>) => {
    const base = {
      action: action.name,
      label: action.label,
      description: action.description,
      tone: action.tone ?? "default",
      inputFields: describeInputs(action),
    };

    if (!action.allowedRoles.includes(actor.role)) {
      return {
        ...base,
        offered: false,
        unavailableReason: `Restricted to ${action.allowedRoles.join(", ")}`,
        decision: null,
      };
    }
    if (action.fromStatus && !action.fromStatus.includes(status)) {
      return {
        ...base,
        offered: false,
        unavailableReason: `Only available from status ${action.fromStatus.join(" or ")}`,
        decision: null,
      };
    }

    const parsed = action.input.safeParse(inputs[action.name] ?? {});
    if (!parsed.success) {
      return { ...base, offered: true, needsInput: true, decision: null };
    }

    const ctx: RuleContext<GovernedRecord, unknown> = {
      actor,
      tool: decl.name,
      action: action.name,
      record,
      input: parsed.data,
      constants,
    };

    return { ...base, offered: true, decision: evaluatePolicy(action.rules, ctx) };
  });
}

interface ZodInternals {
  def?: { type?: string; innerType?: ZodInternals; entries?: Record<string, string> };
}

/** Minimal introspection of an action's Zod schema so forms can render it. */
export function describeInputs(action: ActionDecl<GovernedRecord>): InputFieldDesc[] {
  const shape = (action.input as unknown as { shape?: Record<string, ZodInternals> })
    .shape;
  if (!shape) return [];

  return Object.entries(shape).map(([name, schema]) => {
    let node = schema;
    let optional = false;
    while (
      node.def?.type === "optional" ||
      node.def?.type === "nullable" ||
      node.def?.type === "default"
    ) {
      optional = true;
      node = node.def.innerType as ZodInternals;
    }
    const type = node.def?.type;
    if (type === "number") return { name, type: "number" as const, optional };
    if (type === "boolean") return { name, type: "boolean" as const, optional };
    if (type === "enum") {
      return {
        name,
        type: "enum" as const,
        optional,
        options: Object.values(node.def?.entries ?? {}),
      };
    }
    return { name, type: "string" as const, optional };
  });
}
