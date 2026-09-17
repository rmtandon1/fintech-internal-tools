import type { ZodType, z } from "zod";
import type {
  ActionDecl,
  ApplyContext,
  ApplyResult,
  Decision,
  GovernedRecord,
  Role,
  RuleContext,
  Rule,
  ToolDeclaration,
} from "@/engine/types";

/**
 * Builders that keep tool authors fully typed while the registry stays
 * type-erased. They are the only place the erasure cast lives.
 */
export function defineAction<
  TRecord extends GovernedRecord,
  TSchema extends ZodType,
  TPatch,
>(def: {
  name: string;
  label: string;
  description?: string;
  allowedRoles: Role[];
  input: TSchema;
  fromStatus?: string[];
  tone?: "default" | "destructive" | "primary";
  createsRecord?: boolean;
  rules: Rule<TRecord, z.infer<TSchema>>[];
  decide: (ctx: RuleContext<TRecord, z.infer<TSchema>>) => Decision<TPatch>;
  apply: (
    ctx: ApplyContext<TRecord, z.infer<TSchema>>,
    decision: Decision<TPatch>,
  ) => ApplyResult<TRecord>;
}): ActionDecl<TRecord> {
  return def as unknown as ActionDecl<TRecord>;
}

export function defineTool<TRecord extends GovernedRecord>(
  decl: ToolDeclaration<TRecord>,
): ToolDeclaration {
  return decl as unknown as ToolDeclaration;
}
