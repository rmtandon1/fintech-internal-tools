import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { defineAction, defineTool } from "@/engine/declare";
import type {
  ApplyContext,
  ApplyResult,
  GovernedRecord,
  Rule,
  SortOption,
} from "@/engine/types";
import { kycCases } from "./schema";
import { seedKycCases } from "./seed";

export interface KycCase extends GovernedRecord {
  id: string;
  customerName: string;
  email: string;
  dateOfBirth: string;
  documentType: string;
  documentNumber: string;
  country: string;
  segment: string;
  riskScore: number;
  riskTier: string;
  sanctionsHit: number;
  documentsComplete: number;
  status: string;
  openedAt: number;
  dueAt: number;
  lastNote: string | null;
  decidedBy: string | null;
  version: number;
}

export const MANAGER_REVIEW_SCORE_KEY = "kyc.manager_review_score";
export const ADMIN_REVIEW_SCORE_KEY = "kyc.admin_review_score";
export const PROHIBITED_COUNTRIES_KEY = "kyc.prohibited_countries";

const OPEN_STATUSES = ["pending_review", "info_requested", "escalated"];

/** Rules here read the record only, so they are input-agnostic. */
type CaseRule = Rule<KycCase, unknown>;

const documentsComplete: CaseRule = ({ record }) =>
  record && record.documentsComplete === 0
    ? {
        type: "deny",
        rule: "documents_complete",
        reason: "Required documents are still outstanding",
      }
    : { type: "allow", rule: "documents_complete" };

const noSanctionsHit: CaseRule = ({ record }) =>
  record && record.sanctionsHit === 1
    ? {
        type: "deny",
        rule: "no_sanctions_hit",
        reason: "Open sanctions hit: clear screening before approving",
      }
    : { type: "allow", rule: "no_sanctions_hit" };

const countryPermitted: CaseRule = ({ record, constants }) => {
  const prohibited = constants.stringList(PROHIBITED_COUNTRIES_KEY, []);
  return record && prohibited.includes(record.country)
    ? {
        type: "deny",
        rule: "country_permitted",
        reason: `${record.country} is on the prohibited country list`,
      }
    : { type: "allow", rule: "country_permitted" };
};

const riskTierApproval: CaseRule = ({ record, constants }) => {
  const managerScore = constants.number(MANAGER_REVIEW_SCORE_KEY, 70);
  const adminScore = constants.number(ADMIN_REVIEW_SCORE_KEY, 85);
  const score = record?.riskScore ?? 0;
  if (score >= adminScore) {
    return {
      type: "require_approval",
      rule: "risk_tier_approval",
      tier: "admin",
      allowedRoles: ["admin"],
      reason: `Risk score ${score} is at or above the ${adminScore} admin threshold`,
    };
  }
  if (score >= managerScore) {
    return {
      type: "require_approval",
      rule: "risk_tier_approval",
      tier: "manager",
      allowedRoles: ["manager", "admin"],
      reason: `Risk score ${score} is at or above the ${managerScore} manager threshold`,
    };
  }
  return { type: "allow", rule: "risk_tier_approval" };
};

const escalatedNeedsManager: CaseRule = ({ record }) =>
  record?.status === "escalated"
    ? {
        type: "require_approval",
        rule: "escalated_needs_manager",
        tier: "manager",
        allowedRoles: ["manager", "admin"],
        reason: "The case was escalated, so a manager owns the decision",
      }
    : { type: "allow", rule: "escalated_needs_manager" };

const allow =
  (rule: string): CaseRule =>
  () => ({ type: "allow", rule });

const SORTABLE = {
  customerName: kycCases.customerName,
  country: kycCases.country,
  riskScore: kycCases.riskScore,
  status: kycCases.status,
  dueAt: kycCases.dueAt,
} as const;

function order(sort?: SortOption) {
  const column = sort ? SORTABLE[sort.field as keyof typeof SORTABLE] : undefined;
  if (!column) return desc(kycCases.riskScore);
  return sort?.direction === "asc" ? asc(column) : desc(column);
}

export const kycTool = defineTool<KycCase>({
  name: "kyc",
  displayName: "KYC review queue",
  description: "Customer due diligence cases awaiting a decision.",
  icon: "IdCard",
  group: "Risk & Compliance",
  recordType: "kyc_case",
  visibleTo: ["analyst", "manager", "admin"],
  fields: [
    { name: "customerName", label: "Customer", type: "string" },
    { name: "email", label: "Email", type: "string", isPII: true },
    { name: "dateOfBirth", label: "Date of birth", type: "string", isPII: true },
    { name: "documentType", label: "Document type", type: "string" },
    {
      name: "documentNumber",
      label: "Document number",
      type: "string",
      isPII: true,
      revealTail: 4,
    },
    { name: "country", label: "Country", type: "string" },
    {
      name: "segment",
      label: "Segment",
      type: "enum",
      enumValues: ["consumer", "business"],
    },
    { name: "riskScore", label: "Risk score", type: "number" },
    {
      name: "riskTier",
      label: "Risk tier",
      type: "enum",
      enumValues: ["low", "medium", "high"],
    },
    { name: "sanctionsHit", label: "Sanctions hit", type: "boolean" },
    { name: "documentsComplete", label: "Documents complete", type: "boolean" },
    { name: "openedAt", label: "Opened", type: "date" },
    { name: "dueAt", label: "SLA due", type: "date" },
    { name: "lastNote", label: "Last note", type: "text" },
    { name: "decidedBy", label: "Decided by", type: "string" },
  ],
  listColumns: [
    { field: "customerName", sortable: true },
    { field: "country", sortable: true },
    { field: "segment" },
    { field: "riskScore", align: "right", sortable: true },
    { field: "riskTier" },
    { field: "status", sortable: true },
    { field: "dueAt", sortable: true },
  ],
  filters: [
    {
      field: "status",
      label: "Status",
      type: "enum",
      options: [
        { value: "pending_review", label: "Pending review" },
        { value: "info_requested", label: "Info requested" },
        { value: "escalated", label: "Escalated" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    {
      field: "riskTier",
      label: "Risk tier",
      type: "enum",
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
  ],
  sections: [
    {
      title: "Customer",
      fields: ["customerName", "email", "dateOfBirth", "country", "segment"],
    },
    { title: "Identity document", fields: ["documentType", "documentNumber"] },
    {
      title: "Risk",
      fields: ["riskScore", "riskTier", "sanctionsHit", "documentsComplete"],
    },
    { title: "Case", fields: ["openedAt", "dueAt", "lastNote", "decidedBy"] },
  ],
  statuses: [
    { value: "pending_review", label: "Pending review", tone: "info" },
    { value: "info_requested", label: "Info requested", tone: "warning" },
    { value: "escalated", label: "Escalated", tone: "warning" },
    { value: "approved", label: "Approved", tone: "positive" },
    { value: "rejected", label: "Rejected", tone: "negative" },
  ],
  statusField: "status",
  titleField: "customerName",
  revealRoles: ["manager", "admin"],
  constants: [
    {
      key: MANAGER_REVIEW_SCORE_KEY,
      value: 70,
      type: "number",
      description: "Risk score at which an approval needs a manager",
      tool: "kyc",
    },
    {
      key: ADMIN_REVIEW_SCORE_KEY,
      value: 85,
      type: "number",
      description: "Risk score at which an approval needs an admin",
      tool: "kyc",
    },
    {
      key: PROHIBITED_COUNTRIES_KEY,
      value: ["IR", "KP", "SY", "CU"],
      type: "string_list",
      description: "ISO country codes that may never be approved",
      tool: "kyc",
    },
  ],
  actions: [
    defineAction<KycCase, z.ZodObject<{ note: z.ZodOptional<z.ZodString> }>, Patch>({
      name: "approve",
      label: "Approve case",
      description: "Accept the customer onto the platform.",
      allowedRoles: ["analyst", "manager", "admin"],
      input: z.object({ note: z.string().max(500).optional() }),
      fromStatus: OPEN_STATUSES,
      tone: "primary",
      rules: [
        documentsComplete,
        noSanctionsHit,
        countryPermitted,
        riskTierApproval,
        escalatedNeedsManager,
      ],
      decide: ({ record, input }) => ({
        summary: `Approve KYC case ${record?.id ?? ""} (risk ${record?.riskScore ?? "?"})`,
        patch: { status: "approved", note: input.note ?? null },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<KycCase, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "reject",
      label: "Reject case",
      description: "Decline the customer and close the case.",
      allowedRoles: ["analyst", "manager", "admin"],
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: OPEN_STATUSES,
      tone: "destructive",
      rules: [allow("reject_always_permitted"), escalatedNeedsManager],
      decide: ({ record, input }) => ({
        summary: `Reject KYC case ${record?.id ?? ""}: ${input.reason}`,
        patch: { status: "rejected", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<KycCase, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "request_info",
      label: "Request information",
      description: "Ask the customer for more documents or detail.",
      allowedRoles: ["analyst", "manager", "admin"],
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["pending_review", "escalated"],
      rules: [allow("request_info_always_permitted")],
      decide: ({ record, input }) => ({
        summary: `Request information on ${record?.id ?? ""}: ${input.reason}`,
        patch: { status: "info_requested", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
    defineAction<KycCase, z.ZodObject<{ reason: z.ZodString }>, Patch>({
      name: "escalate",
      label: "Escalate",
      description: "Hand the case to compliance for a senior decision.",
      allowedRoles: ["analyst", "manager", "admin"],
      input: z.object({ reason: z.string().min(5).max(500) }),
      fromStatus: ["pending_review", "info_requested"],
      rules: [allow("escalate_always_permitted")],
      decide: ({ record, input }) => ({
        summary: `Escalate KYC case ${record?.id ?? ""}: ${input.reason}`,
        patch: { status: "escalated", note: input.reason },
      }),
      apply: (ctx, decision) => write(ctx, decision.patch),
    }),
  ],
  list: ({ filters, search, sort, limit, offset }) => {
    const clauses = [];
    if (filters.status) clauses.push(eq(kycCases.status, filters.status));
    if (filters.riskTier) clauses.push(eq(kycCases.riskTier, filters.riskTier));
    if (search) {
      clauses.push(
        or(
          like(kycCases.customerName, `%${search}%`),
          like(kycCases.email, `%${search}%`),
          eq(kycCases.id, search),
        ),
      );
    }
    const where = clauses.length ? and(...clauses) : undefined;
    const rows = db
      .select()
      .from(kycCases)
      .where(where)
      .orderBy(order(sort))
      .limit(limit)
      .offset(offset)
      .all();
    const total = db.select({ id: kycCases.id }).from(kycCases).where(where).all().length;
    return { rows, total };
  },
  get: getCase,
  seed: seedKycCases,
});

interface Patch {
  status: string;
  note: string | null;
}

/**
 * The only write in the tool. The version predicate is what makes a stale
 * request lose the race rather than overwrite a newer decision.
 */
function write(
  { tx, actor, record }: ApplyContext<KycCase, unknown>,
  patch: Patch,
): ApplyResult<KycCase> {
  if (!record) throw new Error("kyc actions require a case");
  const decided = patch.status === "approved" || patch.status === "rejected";
  tx.update(kycCases)
    .set({
      status: patch.status,
      lastNote: patch.note,
      decidedBy: decided ? actor.id : record.decidedBy,
      version: record.version + 1,
    })
    .where(and(eq(kycCases.id, record.id), eq(kycCases.version, record.version)))
    .run();
  const after = getCase(record.id);
  if (!after) throw new Error(`kyc case ${record.id} vanished mid-apply`);
  return { recordId: record.id, before: record, after };
}

function getCase(id: string): KycCase | null {
  return db.select().from(kycCases).where(eq(kycCases.id, id)).get() ?? null;
}
