import type { ZodType } from "zod";
import type { WriteHandle } from "@console/db-write";
import type { Role } from "@console/permissions";

/**
 * Transactional write handle. Tools receive one from the engine for the
 * duration of their `apply` step; they never import a write client themselves.
 */
export type { WriteHandle };
export type { Role };

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export type FieldType =
  | "string"
  | "text"
  | "number"
  | "currency"
  | "boolean"
  | "date"
  | "enum";

export interface FieldDecl {
  name: string;
  label: string;
  type: FieldType;
  /** Personal data: masked at the read boundary unless revealed by a permitted role. */
  isPII?: boolean;
  /** Number of trailing characters left visible when masked. */
  revealTail?: number;
  enumValues?: readonly string[];
  /** For `currency` fields: the field holding the ISO currency code. */
  currencyField?: string;
  /** For `currency` fields always denominated in one currency. */
  currency?: string;
  help?: string;
}

export interface ColumnDecl {
  field: string;
  label?: string;
  align?: "left" | "right";
  /** Offers the column as a sort key; the tool's `list` resolves the field. */
  sortable?: boolean;
}

export interface FilterDecl {
  field: string;
  label: string;
  type: "enum" | "text";
  options?: readonly { value: string; label: string }[];
}

export interface SectionDecl {
  title: string;
  fields: string[];
}

export type StatusTone = "neutral" | "positive" | "negative" | "warning" | "info";

export interface StatusDecl {
  value: string;
  label: string;
  tone: StatusTone;
}

export type RuleOutcome =
  | { type: "allow"; rule: string; message?: string }
  | { type: "deny"; rule: string; reason: string }
  | {
      type: "require_approval";
      rule: string;
      tier: ApprovalTier;
      allowedRoles: Role[];
      reason: string;
    };

export type ApprovalTier = "manager" | "admin";

export type PolicyTrace = RuleOutcome[];

export interface PolicyDecision {
  effect: "allow" | "deny" | "require_approval";
  trace: PolicyTrace;
  reason?: string;
  tier?: ApprovalTier;
  allowedRoles?: Role[];
}

/** Read-only context handed to every policy rule. */
export interface RuleContext<TRecord = unknown, TInput = unknown> {
  actor: Actor;
  tool: string;
  action: string;
  record: TRecord | null;
  input: TInput;
  /** Runtime constants, read fresh on every evaluation. */
  constants: ConstantReader;
}

export interface ConstantReader {
  number(key: string, fallback: number): number;
  stringList(key: string, fallback: string[]): string[];
  boolean(key: string, fallback: boolean): boolean;
}

export type Rule<TRecord = unknown, TInput = unknown> = (
  ctx: RuleContext<TRecord, TInput>,
) => RuleOutcome;

/** What the tool decided to do, computed without writing anything. */
export interface Decision<TPatch = unknown> {
  /** Human readable one-liner shown in the audit stream. */
  summary: string;
  patch: TPatch;
  nextStatus?: string;
}

/** Minimal write surface the engine lends to a tool's `apply` step. */
export interface ApplyContext<TRecord = unknown, TInput = unknown> {
  tx: WriteHandle;
  actor: Actor;
  record: TRecord | null;
  input: TInput;
  now: number;
}

export interface ApplyResult<TRecord = unknown> {
  recordId: string;
  before: TRecord | null;
  after: TRecord;
}

export interface ActionDecl<TRecord = unknown, TInput = unknown, TPatch = unknown> {
  name: string;
  label: string;
  description?: string;
  allowedRoles: Role[];
  /** Zod schema for the action input; validated before anything else runs. */
  input: ZodType<TInput>;
  /** Statuses the record must be in for the action to be offered. */
  fromStatus?: string[];
  tone?: "default" | "destructive" | "primary";
  /** Set when the action creates the record it governs rather than mutating one. */
  createsRecord?: boolean;
  rules: Rule<TRecord, TInput>[];
  decide: (ctx: RuleContext<TRecord, TInput>) => Decision<TPatch>;
  apply: (
    ctx: ApplyContext<TRecord, TInput>,
    decision: Decision<TPatch>,
  ) => ApplyResult<TRecord>;
}

/** Every governed record carries an id and a version bumped on each write. */
export interface GovernedRecord {
  id: string;
  version: number;
  [key: string]: unknown;
}

export interface ConstantDefinition {
  key: string;
  value: number | string[] | boolean;
  type: "number" | "string_list" | "boolean";
  description: string;
  tool: string;
}

/** PII-free aggregate of another tool's records tied to this one. */
export interface LinkedActivitySummary {
  count: number;
  /** Formatted total across the rows. */
  total: string;
  /** Distinct categorical codes across the rows, e.g. reason codes. */
  codes: string[];
  /** Rows with a pending approval request against them. */
  held: number;
}

export interface LinkedActivity {
  /** Tool the rows belong to; its declaration masks them at the read boundary. */
  tool: string;
  title: string;
  summary: LinkedActivitySummary;
  /** Raw rows, empty when the actor may not see the linked tool. */
  rows: GovernedRecord[];
  /** Fields of the linked tool to show per row. */
  rowFields: string[];
  /** Ids of rows that carry a pending approval request. */
  heldIds: string[];
  /** Where the linked tool opens this cluster; null when the actor cannot open it. */
  href: string | null;
}

export interface ToolDeclaration<TRecord extends GovernedRecord = GovernedRecord> {
  name: string;
  displayName: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  group: string;
  recordType: string;
  /** Roles that may see the tool at all. */
  visibleTo: Role[];
  fields: FieldDecl[];
  listColumns: ColumnDecl[];
  filters: FilterDecl[];
  sections: SectionDecl[];
  statuses: StatusDecl[];
  statusField: string;
  titleField: string;
  /** Roles allowed to reveal masked PII (the reveal itself is audited). */
  revealRoles: Role[];
  actions: ActionDecl<TRecord>[];
  list: (opts: ListOptions) => { rows: TRecord[]; total: number };
  get: (id: string) => TRecord | null;
  /** Statuses that count as open work on the home Work panel. */
  openStatuses?: string[];
  /** Returns a short marker (e.g. "overdue") when a record needs attention, else null. */
  attention?: (record: TRecord, now: number) => string | null;
  /**
   * Records of another tool tied to this one. Runs on the server with the
   * read client; rows are only returned to actors who may see the other tool.
   */
  linkedActivity?: (record: TRecord, actor: Actor) => LinkedActivity | null;
  /** Default policy thresholds installed when the database is seeded. */
  constants?: ConstantDefinition[];
  /** Installs demo records. Must be safe to run twice. */
  seed?: () => void;
  /** Named groupings an operator can open from the queue and act on. */
  clusters?: ClusterDecl[];
}

/** One group within a cluster: an aggregate over records, carrying no PII. */
export interface ClusterGroup {
  key: string;
  label: string;
  count: number;
  /** What the count counts, e.g. a reason code; shown after the count. */
  qualifier?: string;
  totalUsdMinor: number;
  /** Look-back window the group was computed over, in days. */
  windowDays?: number;
  recordIds: string[];
}

export interface ClusterDecl {
  id: string;
  label: string;
  groups: () => ClusterGroup[];
  /** The action whose policy trace is shown for each row in the group. */
  traceAction?: string;
  /** The spec a Devin run for this cluster would follow, if any. */
  handoffSpec?: string;
}

export interface ListOptions {
  filters: Record<string, string>;
  search?: string;
  sort?: SortOption;
  limit: number;
  offset: number;
}

export interface SortOption {
  field: string;
  direction: "asc" | "desc";
}

export interface Intent<TInput = unknown> {
  tool: string;
  action: string;
  recordId: string | null;
  input: TInput;
  idempotencyKey: string;
}

export type IntentOutcome =
  | {
      status: "applied";
      recordId: string;
      auditId: string;
      summary: string;
      trace: PolicyTrace;
    }
  | {
      status: "pending_approval";
      approvalId: string;
      reason: string;
      trace: PolicyTrace;
    }
  | {
      status: "denied";
      reason: string;
      trace: PolicyTrace;
    }
  | {
      status: "error";
      code: IntentErrorCode;
      message: string;
      trace?: PolicyTrace;
    };

export type IntentErrorCode =
  | "unknown_tool"
  | "unknown_action"
  | "forbidden_role"
  | "invalid_input"
  | "record_not_found"
  | "invalid_status"
  | "idempotency_conflict"
  | "in_progress"
  | "version_conflict"
  | "self_approval"
  | "approval_not_found"
  | "approval_not_pending"
  | "internal_error";

export interface IntentResult {
  outcome: IntentOutcome;
  /** True when the result was replayed from a previous identical submission. */
  replayed: boolean;
}
