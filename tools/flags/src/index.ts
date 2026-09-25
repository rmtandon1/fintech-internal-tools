import { and, asc, desc, eq, inArray, like, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@console/db";
import { defineAction, defineTool } from "@console/engine/declare";
import type {
  ApplyContext,
  ApplyResult,
  GovernedRecord,
  Rule,
  SortOption,
} from "@console/engine/types";
import { MANAGER_ROLES } from "@console/permissions";
import { featureFlags } from "./schema";
import { seedFeatureFlags } from "./seed";

export interface FeatureFlag extends GovernedRecord {
  id: string;
  key: string;
  description: string;
  flagType: string;
  environment: string;
  owner: string;
  enabled: number;
  rolloutPercent: number;
  customerFacing: number;
  status: string;
  expiresAt: number | null;
  lastChangedBy: string | null;
  lastChangedAt: number;
  lastNote: string | null;
  version: number;
}

export const PROD_APPROVAL_KEY = "flags.production_change_needs_manager";
export const ROLLOUT_STEP_KEY = "flags.rollout_step_needs_manager_percent";
export const PERMISSION_ADMIN_KEY = "flags.permission_flag_needs_admin";

type FlagRule<TInput> = Rule<FeatureFlag, TInput>;

/** Permission flags grant access, so they are held to the admin tier. */
const permissionFlagTier: FlagRule<unknown> = ({ record, constants }) =>
  record &&
  record.flagType === "permission" &&
  constants.boolean(PERMISSION_ADMIN_KEY, true)
    ? {
        type: "require_approval",
        rule: "permission_flag_tier",
        tier: "admin",
        allowedRoles: ["admin"],
        reason: "Permission flags change who can access what",
      }
    : { type: "allow", rule: "permission_flag_tier" };

/** Turning something on in production is the change that reaches customers. */
const productionEnable: FlagRule<unknown> = ({ record, constants }) =>
  record &&
  record.environment === "production" &&
  record.customerFacing === 1 &&
  constants.boolean(PROD_APPROVAL_KEY, true)
    ? {
        type: "require_approval",
        rule: "production_enable",
        tier: "manager",
        allowedRoles: MANAGER_ROLES,
        reason: "Enabling a customer-facing flag in production needs a manager",
      }
    : { type: "allow", rule: "production_enable" };

const notArchived: FlagRule<unknown> = ({ record }) =>
  record && record.status === "archived"
    ? {
        type: "deny",
        rule: "not_archived",
        reason: "This flag is archived; the code path behind it no longer exists",
      }
    : { type: "allow", rule: "not_archived" };

const notExpired: FlagRule<unknown> = ({ record }) =>
  record && record.expiresAt !== null && record.expiresAt < Date.now()
    ? {
        type: "require_approval",
        rule: "not_expired",
        tier: "manager",
        allowedRoles: MANAGER_ROLES,
        reason: "This flag is past its review date and should be cleaned up",
      }
    : { type: "allow", rule: "not_expired" };

/** Only an increase is a risk; dialling a rollout down is incident response. */
const rolloutIncrease: FlagRule<{ percent: number }> = ({
  record,
  input,
  constants,
}) => {
  const step = constants.number(ROLLOUT_STEP_KEY, 25);
  const delta = input.percent - (record?.rolloutPercent ?? 0);
  return delta > step
    ? {
        type: "require_approval",
        rule: "rollout_increase",
        tier: "manager",
        allowedRoles: MANAGER_ROLES,
        reason: `Raising the rollout by ${delta} points exceeds the ${step}-point step`,
      }
    : { type: "allow", rule: "rollout_increase" };
};

/**
 * A rollout that raises customer exposure in production is the same change as
 * an enable, so it carries the same gate. A decrease stays ungated.
 */
const productionExposureIncrease: FlagRule<{ percent: number }> = ({
  record,
  input,
  constants,
}) =>
  record &&
  record.environment === "production" &&
  record.customerFacing === 1 &&
  input.percent > record.rolloutPercent &&
  constants.boolean(PROD_APPROVAL_KEY, true)
    ? {
        type: "require_approval",
        rule: "production_exposure_increase",
        tier: "manager",
        allowedRoles: MANAGER_ROLES,
        reason: "Raising customer-facing traffic in production needs a manager",
      }
    : { type: "allow", rule: "production_exposure_increase" };

const allow =
  <TInput>(rule: string): FlagRule<TInput> =>
  () => ({ type: "allow", rule });

const SORTABLE = {
  key: featureFlags.key,
  environment: featureFlags.environment,
  rolloutPercent: featureFlags.rolloutPercent,
  owner: featureFlags.owner,
  status: featureFlags.status,
  expiresAt: featureFlags.expiresAt,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return asc(featureFlags.key);
  return sort?.direction === "desc" ? desc(column) : asc(column);
}

export const flagTool = defineTool<FeatureFlag>({
  name: "flags",
  displayName: "Feature flags",
  description: "Switch features on or off, and choose who sees them.",
  icon: "ToggleRight",
  group: "Platform",
  recordType: "feature_flag",
  visibleTo: MANAGER_ROLES,
  fields: [
    { name: "key", label: "Key", type: "string", help: "Can't be changed once created" },
    { name: "description", label: "Description", type: "text" },
    {
      name: "flagType",
      label: "Type",
      type: "enum",
      enumValues: ["release", "ops", "kill_switch", "experiment", "permission"],
    },
    {
      name: "environment",
      label: "Environment",
      type: "enum",
      enumValues: ["development", "staging", "production"],
    },
    { name: "owner", label: "Owner", type: "string" },
    { name: "enabled", label: "Enabled", type: "boolean" },
    { name: "rolloutPercent", label: "Rollout %", type: "number" },
    { name: "customerFacing", label: "Customer facing", type: "boolean" },
    { name: "expiresAt", label: "Review by", type: "date" },
    { name: "lastChangedBy", label: "Last changed by", type: "string" },
    { name: "lastChangedAt", label: "Last changed", type: "date" },
    { name: "lastNote", label: "Last note", type: "text" },
  ],
  listColumns: [
    { field: "key", sortable: true },
    { field: "flagType" },
    { field: "environment", sortable: true },
    { field: "rolloutPercent", align: "right", sortable: true },
    { field: "owner", sortable: true },
    { field: "status", sortable: true },
    { field: "expiresAt", sortable: true },
  ],
  filters: [
    {
      field: "environment",
      label: "Environment",
      type: "enum",
      options: [
        { value: "development", label: "Development" },
        { value: "staging", label: "Staging" },
        { value: "production", label: "Production" },
      ],
    },
    {
      field: "flagType",
      label: "Type",
      type: "enum",
      options: [
        { value: "release", label: "Release" },
        { value: "ops", label: "Ops" },
        { value: "kill_switch", label: "Kill switch" },
        { value: "experiment", label: "Experiment" },
        { value: "permission", label: "Permission" },
      ],
    },
    {
      field: "status",
      label: "Status",
      type: "enum",
      options: [
        { value: "off", label: "Off" },
        { value: "partial", label: "Partial" },
        { value: "on", label: "On" },
        { value: "archived", label: "Archived" },
      ],
    },
    {
      field: "expired",
      label: "Review date",
      type: "enum",
      options: [{ value: "yes", label: "Expired, still serving" }],
    },
  ],
  stats: [
    {
      key: "partial_production",
      label: "Partial in production",
      roles: ["kyc_manager", "refunds_manager"],
      source: { kind: "records", filters: { environment: "production", status: "partial" } },
    },
    {
      key: "expired_serving",
      label: "Expired, still serving",
      roles: ["kyc_manager", "refunds_manager"],
      tone: "warning",
      source: { kind: "records", filters: { expired: "yes" } },
    },
    {
      key: "awaiting_approval",
      label: "Need your approval",
      roles: MANAGER_ROLES,
      source: { kind: "approvals", scope: "decidable" },
    },
    {
      key: "denied_24h",
      label: "Blocked in the last day",
      roles: ["admin"],
      tone: "warning",
      source: { kind: "audit", event: "denied", sinceHours: 24 },
    },
    {
      key: "policy_changes_7d",
      label: "Setting changes this week",
      roles: ["admin"],
      source: { kind: "audit", event: "constant_changed", sinceHours: 24 * 7 },
    },
  ],
  sections: [
    { title: "Flag", fields: ["key", "description", "flagType", "environment"] },
    { title: "State", fields: ["enabled", "rolloutPercent", "customerFacing"] },
    { title: "Ownership", fields: ["owner", "expiresAt", "lastChangedBy", "lastChangedAt", "lastNote"] },
  ],
  statuses: [
    { value: "off", label: "Off", tone: "neutral" },
    { value: "partial", label: "Partial", tone: "warning" },
    { value: "on", label: "On", tone: "positive" },
    { value: "archived", label: "Archived", tone: "neutral" },
  ],
  statusField: "status",
  titleField: "key",
  revealRoles: MANAGER_ROLES,
  openStatuses: ["partial"],
  constants: [
    {
      key: PROD_APPROVAL_KEY,
      value: true,
      type: "boolean",
      description: "Turning on a customer-facing flag in production needs a manager. true or false.",
      tool: "flags",
    },
    {
      key: ROLLOUT_STEP_KEY,
      value: 25,
      type: "number",
      description: "The biggest rollout increase, in percentage points, allowed without a manager.",
      tool: "flags",
    },
    {
      key: PERMISSION_ADMIN_KEY,
      value: true,
      type: "boolean",
      description: "Changing a permission flag needs an admin. true or false.",
      tool: "flags",
    },
  ],
  actions: [
    defineAction<FeatureFlag, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "enable",
      label: "Enable",
      description: "Turn the flag fully on.",
      allowedRoles: MANAGER_ROLES,
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["off", "partial"],
      tone: "primary",
      rules: [notArchived, notExpired, permissionFlagTier, productionEnable],
      decide: ({ record, input }) => ({
        summary: `Enable ${record?.key ?? ""}: ${input.reason}`,
        patch: { enabled: 1, rolloutPercent: 100, status: "on", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<FeatureFlag, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "disable",
      label: "Disable",
      description: "Turn the flag off. Available to any manager, for incident response.",
      allowedRoles: MANAGER_ROLES,
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["on", "partial"],
      tone: "destructive",
      // Deliberately unguarded: an approval queue in front of a kill switch
      // would make an incident worse. The audit record is the control.
      rules: [notArchived, allow("kill_switch_is_always_available")],
      decide: ({ record, input }) => ({
        summary: `Disable ${record?.key ?? ""}: ${input.reason}`,
        patch: { enabled: 0, rolloutPercent: 0, status: "off", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<
      FeatureFlag,
      z.ZodObject<{ percent: z.ZodNumber; reason: z.ZodString }>,
      Patch
    >({
      name: "set_rollout",
      label: "Set rollout",
      description: "Move the flag to a percentage of traffic.",
      allowedRoles: MANAGER_ROLES,
      input: z.object({
        percent: z.number().int().min(0).max(100),
        reason: z.string().min(5).max(500),
      }),
      fromStatus: ["off", "partial", "on"],
      rules: [
        notArchived,
        notExpired,
        permissionFlagTier,
        productionExposureIncrease,
        rolloutIncrease,
      ],
      decide: ({ record, input }) => ({
        summary: `Set ${record?.key ?? ""} rollout to ${input.percent}%: ${input.reason}`,
        patch: {
          enabled: input.percent > 0 ? 1 : 0,
          rolloutPercent: input.percent,
          status: input.percent === 0 ? "off" : input.percent === 100 ? "on" : "partial",
          note: input.reason,
        },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<FeatureFlag, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "archive",
      label: "Archive",
      description: "Retire a flag whose code path has been removed.",
      allowedRoles: MANAGER_ROLES,
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["off"],
      rules: [notArchived],
      decide: ({ record, input }) => ({
        summary: `Archive ${record?.key ?? ""}: ${input.reason}`,
        patch: { enabled: 0, rolloutPercent: 0, status: "archived", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
  ],
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses = [];
    if (filters.status) clauses.push(eq(featureFlags.status, filters.status));
    if (filters.environment)
      clauses.push(eq(featureFlags.environment, filters.environment));
    if (filters.flagType) clauses.push(eq(featureFlags.flagType, filters.flagType));
    if (filters.expired === "yes") {
      clauses.push(
        lt(featureFlags.expiresAt, Date.now()),
        inArray(featureFlags.status, ["on", "partial"]),
      );
    }
    if (search) {
      clauses.push(
        or(
          like(featureFlags.key, `%${search}%`),
          like(featureFlags.description, `%${search}%`),
          eq(featureFlags.id, search),
        ),
      );
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const rows = db
      .select()
      .from(featureFlags)
      .where(where)
      .orderBy(order(sort))
      .limit(limit)
      .offset(offset)
      .all();
    const total = db
      .select({ id: featureFlags.id })
      .from(featureFlags)
      .where(where)
      .all().length;
    return { rows, total };
  },
  ruleLabels: {
    permission_flag_tier: "Permission flag",
    production_enable: "Production switch-on",
    not_archived: "Flag not retired",
    not_expired: "Flag not past its review date",
    rollout_increase: "Rollout step",
    production_exposure_increase: "Production traffic increase",
    kill_switch_is_always_available: "Switching off is always allowed",
  },
  get: getFlag,
  seed: seedFeatureFlags,
});

interface Patch {
  enabled: number;
  rolloutPercent: number;
  status: string;
  note: string;
}

function write(
  { tx, actor, record, now }: ApplyContext<FeatureFlag, unknown>,
  patch: Patch,
): ApplyResult<FeatureFlag> {
  if (!record) throw new Error("flag actions require a record");
  tx.update(featureFlags)
    .set({
      enabled: patch.enabled,
      rolloutPercent: patch.rolloutPercent,
      status: patch.status,
      lastNote: patch.note,
      lastChangedBy: actor.id,
      lastChangedAt: now,
      version: record.version + 1,
    })
    .where(and(eq(featureFlags.id, record.id), eq(featureFlags.version, record.version)))
    .run();
  const after = getFlag(record.id);
  if (!after) throw new Error(`flag ${record.id} vanished mid-apply`);
  return { recordId: record.id, before: record, after };
}

function getFlag(id: string): FeatureFlag | null {
  return db.select().from(featureFlags).where(eq(featureFlags.id, id)).get() ?? null;
}
