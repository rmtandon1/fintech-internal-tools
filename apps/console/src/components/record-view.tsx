import { ActionBar } from "@/components/action-panel";
import { AuditTimeline } from "@/components/audit-timeline";
import { CustomerCard } from "@/components/customer-card";
import { KycCaseFile } from "@/components/kyc-case-file";
import { CUSTOMER_CARD_FIELDS, customerFacts, type CustomerFacts } from "@/lib/customer-profile";
import { kycThresholds } from "@/lib/kyc-thresholds";
import { caseFile, companyNumber, kycTool } from "@console/tool-kyc";
import { Panel } from "@/components/panel";
import { PolicyTraceList, ruleLabel } from "@console/ui/policy-trace";
import { RevealField } from "@/components/reveal-field";
import { FieldHighlight, type HighlightTone } from "@/components/field-highlight";
import { auditTrailFor } from "@console/engine/audit/query";
import { maskRecord } from "@console/engine/pii/mask";
import { previewActions, type ActionPreview } from "@console/engine/policy/preview";
import type { Actor, FieldDecl, GovernedRecord, RuleOutcome, ToolDeclaration } from "@console/engine/types";
import { formatFieldValue, formatTimestamp, titleCase } from "@console/ui/format";
import { Icon } from "@console/ui/icon";
import { StatusChip } from "@console/ui/status-chip";
import { cn } from "@console/ui/utils";

/**
 * The whole record surface — fields, policy trace, linked activity and the
 * action bar — shared verbatim by the home page and /t/[tool]/[id].
 */
export function RecordView({
  decl,
  record,
  actor,
  actions,
  extra,
}: {
  decl: ToolDeclaration;
  record: GovernedRecord;
  actor: Actor;
  /** Replaces the generic action bar for tools whose inputs the server derives. */
  actions?: React.ReactNode;
  /** Extra panels rendered under the policy trace. */
  extra?: React.ReactNode;
}) {
  const masked = maskRecord(decl, record, actor);
  const previews = previewActions(decl, record, actor);
  const trail = auditTrailFor(decl.recordType, record.id);

  // The checks for the first action this person can take, so they can see
  // what would happen before they click.
  const traced = previews.find((p) => p.offered && p.decision);
  const highlights = heldFields(decl, previews);
  const facts = decl.name === kycTool.name ? customerFacts(record) : null;
  const business = facts?.segment === "business";
  // Fields the customer card already shows are not repeated in the grid; a
  // company has no date of birth or identity document to show.
  const hidden = business ? [...CUSTOMER_CARD_FIELDS, ...BUSINESS_HIDDEN_FIELDS] : CUSTOMER_CARD_FIELDS;
  const sections = facts
    ? decl.sections
        .filter((s) => !(business && BUSINESS_HIDDEN_SECTIONS.includes(s.title)))
        .map((s) => ({ ...s, fields: s.fields.filter((f) => !hidden.includes(f)) }))
        .filter((s) => s.fields.length > 0)
    : decl.sections;
  const holds = traced?.decision ? managerHolds(traced.decision.trace) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {holds.length > 0 ? <ManagerHoldBox holds={holds} labels={decl.ruleLabels} /> : null}
        {facts ? <CustomerCardFor decl={decl} record={record} facts={facts} /> : null}
        {facts ? <KycCaseFile caseId={record.id} hold={declaredVsFoundHold(previews)} /> : null}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 xl:grid-cols-3">
          {business ? <CompanySection record={record} /> : null}
          {sections.map((section) => (
            <div key={section.title} className="contents">
              <div className="col-span-full mt-3 border-b border-border pb-2 text-sm font-semibold text-foreground first:mt-0">
                {section.title}
              </div>
              {section.fields.map((name) => {
                const field = decl.fields.find((f) => f.name === name);
                if (!field) return null;
                const numeric =
                  field.type === "number" || field.type === "currency";
                const body = (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {field.label}
                    </div>
                    {field.isPII ? (
                      <RevealField
                        tool={decl.name}
                        recordId={record.id}
                        field={field.name}
                        masked={String(masked.values[name] ?? "—")}
                        canReveal={masked.canReveal}
                      />
                    ) : (
                      <FieldValue field={field} masked={masked.values} numeric={numeric} />
                    )}
                  </>
                );
                const held = highlights.get(name);
                return held ? (
                  <FieldHighlight key={name} tone={held.tone} reasons={held.reasons}>
                    {body}
                  </FieldHighlight>
                ) : (
                  <div key={name} className="min-w-0 space-y-0.5">
                    {body}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {traced?.decision ? (
          <Panel
            title={
              <span className="normal-case tracking-normal">
                If you {traced.label.toLowerCase()} now
              </span>
            }
            className="mx-5 mb-5"
            bodyClassName="py-0.5"
          >
            <PolicyTraceList trace={traced.decision.trace} labels={decl.ruleLabels} />
          </Panel>
        ) : null}
        {extra}
      </div>

      {trail.length > 0 ? (
      <details
        open={trail.length <= 3}
        className="shrink-0 border-t border-border"
      >
        <summary className="flex h-10 cursor-pointer items-center gap-2 border-b border-border px-4 text-sm font-semibold text-foreground">
          History · <span className="tabular-nums">{trail.length}</span>
        </summary>
        <div className="max-h-40 overflow-auto py-0.5">
          <AuditTimeline events={trail} compact />
        </div>
      </details>
      ) : null}

      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
        {actions ?? (
          <ActionBar
            key={`${decl.name}:${record.id}`}
            tool={decl.name}
            recordId={record.id}
            recordLabel={String(record[decl.titleField] ?? record.id)}
            previews={previews}
            statuses={decl.statuses}
            ruleLabels={decl.ruleLabels}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Fields a rule is holding or blocking an offered action on, with the rules'
 * reasons. A block outranks a hold when both touch the same field.
 */
function heldFields(
  decl: ToolDeclaration,
  previews: ActionPreview[],
): Map<string, { tone: HighlightTone; reasons: string[] }> {
  const held = new Map<string, { tone: HighlightTone; reasons: string[] }>();
  for (const preview of previews) {
    if (!preview.offered || !preview.decision) continue;
    for (const outcome of preview.decision.trace) {
      if (outcome.type === "allow") continue;
      for (const field of decl.ruleFields?.[outcome.rule] ?? []) {
        const entry = held.get(field) ?? { tone: "approval" as HighlightTone, reasons: [] };
        if (outcome.type === "deny") entry.tone = "block";
        if (!entry.reasons.includes(outcome.reason)) entry.reasons.push(outcome.reason);
        held.set(field, entry);
      }
    }
  }
  return held;
}

/** What a business case never shows: a company has no birthday or passport. */
const BUSINESS_HIDDEN_FIELDS = ["dateOfBirth", "documentType", "documentNumber"];
const BUSINESS_HIDDEN_SECTIONS = ["Identity document"];

/** The company's registration and its latest registry check, in place of an identity document. */
function CompanySection({ record }: { record: GovernedRecord }) {
  const registry = caseFile(record.id)
    .checks.filter((check) => check.kind === "company_registry")
    .sort((a, b) => b.checkedAt - a.checkedAt)[0];
  const number = typeof record.documentNumber === "string" ? companyNumber(record.documentNumber) : "—";
  return (
    <div className="contents" data-testid="company-section">
      <div className="col-span-full border-b border-border pb-2 text-sm font-semibold text-foreground">
        Company
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs text-muted-foreground">Company number</div>
        <div className="font-mono text-sm tabular-nums">{number}</div>
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs text-muted-foreground">Latest registry check</div>
        {registry ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm" data-testid="registry-check">
            <StatusChip
              value={registry.result}
              statuses={[{ value: registry.result, label: titleCase(registry.result), tone: registry.result === "clear" || registry.result === "verified" ? "positive" : "warning" }]}
            />
            <span className="text-muted-foreground">
              {registry.source} · {formatTimestamp(registry.checkedAt)}
            </span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Never checked</div>
        )}
      </div>
    </div>
  );
}

/** The rules routing the traced action to a manager, with their reasons. */
function managerHolds(trace: RuleOutcome[]): { rule: string; reason: string }[] {
  return trace.flatMap((o) => (o.type === "require_approval" ? [{ rule: o.rule, reason: o.reason }] : []));
}

/** Why the record sits in the manager's queue: each holding rule by name, then its reason. */
function ManagerHoldBox({
  holds,
  labels,
}: {
  holds: { rule: string; reason: string }[];
  labels?: Record<string, string>;
}) {
  return (
    <div
      className="mx-5 mt-5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
      data-testid="manager-hold"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon name="UserCheck" className="size-4 text-warning" />
        Why this needs a manager
      </div>
      <ul className="mt-1.5 space-y-1 text-sm">
        {holds.map((hold) => (
          <li key={hold.rule} className="break-words">
            <span className="font-medium">{ruleLabel(hold.rule, labels)}:</span>{" "}
            <span className="text-muted-foreground">{hold.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The declared_vs_found hold reasons across the offered action previews. */
function declaredVsFoundHold(previews: ActionPreview[]): string[] {
  const reasons: string[] = [];
  for (const p of previews) {
    if (!p.offered || !p.decision) continue;
    for (const o of p.decision.trace) {
      if (o.rule === "declared_vs_found" && o.type === "require_approval" && !reasons.includes(o.reason)) {
        reasons.push(o.reason);
      }
    }
  }
  return reasons;
}

function CustomerCardFor({
  decl,
  record,
  facts,
}: {
  decl: ToolDeclaration;
  record: GovernedRecord;
  facts: CustomerFacts;
}) {
  const { prohibited, ...thresholds } = kycThresholds();
  return (
    <CustomerCard
      key={record.id}
      facts={facts}
      thresholds={thresholds}
      countryAllowed={!prohibited.includes(facts.country)}
      open={decl.openStatuses?.includes(String(record[decl.statusField])) ?? true}
      now={Date.now()}
    />
  );
}

function FieldValue({
  field,
  masked,
  numeric,
}: {
  field: FieldDecl;
  masked: Record<string, unknown>;
  numeric: boolean;
}) {
  const value = formatFieldValue(field, masked);
  const multiline = field.type === "text";
  return (
    <div
      className={cn(
        "text-sm",
        multiline ? "whitespace-pre-wrap break-words" : "truncate",
        numeric && "tabular-nums",
      )}
      title={value !== "—" ? value : field.help}
    >
      {value}
    </div>
  );
}
