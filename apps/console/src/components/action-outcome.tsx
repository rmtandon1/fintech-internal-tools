"use client";

import Link from "next/link";
import { useState } from "react";
import type { SubmitResult } from "@/app/actions";
import type { IntentOutcome, PolicyTrace, RuleOutcome } from "@console/engine/types";
import { PolicyTraceList } from "@console/ui/policy-trace";
import { cn } from "@console/ui/utils";

/**
 * What the engine did with one submission, read from the result and the audit
 * row it points at. Lines are labelled by what they prove; a line with no
 * value is not rendered. Nothing here is tool-specific.
 */
export function ActionOutcome({
  result,
  tool,
  action,
  recordId,
  idempotencyKey,
}: {
  result: SubmitResult;
  tool: string;
  action: string;
  recordId: string | null;
  idempotencyKey: string;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const { outcome, audit } = result;
  if (outcome.status === "error") return null;

  const before = audit?.before ?? null;
  const after = audit?.after ?? null;
  const statusField = audit?.statusField;
  const statusBefore = statusField ? stringOf(before?.[statusField]) : null;
  const statusAfter = statusField ? stringOf(after?.[statusField]) : null;
  const versionBefore = numberOf(before?.version);
  const versionAfter = numberOf(after?.version);
  const frozenVersion = audit?.frozenVersion ?? versionBefore;
  const approval = outcome.trace.find(isApproval);
  const denial = outcome.trace.find(isDenial);
  const subject = recordId ?? (outcome.status === "applied" ? outcome.recordId : null);

  const header = [
    headline(outcome.status, approval?.tier, statusBefore !== statusAfter ? statusAfter : null),
    subject,
    statusLine(outcome.status, statusBefore, statusAfter),
    versionLine(versionBefore, versionAfter),
  ].filter(isPresent);

  return (
    <div
      data-testid="action-outcome"
      className={cn(
        "w-full rounded-md border bg-card font-mono text-[11px] leading-5",
        outcome.status === "denied" ? "border-red-400/40" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 border-b border-border px-3 py-1.5 font-medium",
          TONE[outcome.status],
        )}
      >
        {header.map((part, index) => (
          <span key={index} className="flex items-baseline gap-x-2">
            {index > 0 ? <span className="text-muted-foreground">·</span> : null}
            <span className={index === 0 ? "uppercase tracking-wider" : "text-foreground"}>
              {part}
            </span>
          </span>
        ))}
      </div>

      <dl className="px-3 py-1.5">
        {audit ? (
          <Line mark="✓" label="Permission">
            {audit.actorRole} is allowed to {action} in {tool}
          </Line>
        ) : null}

        <Line
          mark={denial ? "✗" : approval ? "→" : "✓"}
          tone={denial ? "deny" : approval ? "approval" : "allow"}
          label="Policy"
          trailing={
            outcome.trace.length > 0 ? (
              <Toggle
                open={traceOpen}
                onToggle={() => setTraceOpen((open) => !open)}
                label="trace"
              />
            ) : null
          }
        >
          {policyLine(outcome.trace, denial, approval)}
        </Line>
        {traceOpen ? (
          <div className="my-1 rounded-md border border-border">
            <PolicyTraceList trace={outcome.trace} />
          </div>
        ) : null}

        {outcome.status === "pending_approval" ? (
          <Line mark="✓" label="Held">
            request {shortId(outcome.approvalId)} keeps the input
            {frozenVersion !== null ? ` and v${frozenVersion}` : ""} until a decision
          </Line>
        ) : audit ? (
          <Line mark="✓" label="Recorded">
            by {audit.actorId} at {utc(audit.ts)}
          </Line>
        ) : null}

        {audit ? (
          <Line
            mark="✓"
            label="Audit"
            trailing={
              <Link
                href={`/audit?recordId=${encodeURIComponent(subject ?? "")}`}
                className="text-muted-foreground hover:text-foreground"
              >
                [open]
              </Link>
            }
          >
            #{audit.seq}
            {audit.event !== "applied" ? ` ${audit.event}` : ""} · {shortHash(audit.rowHash)}{" "}
            · chain {audit.chainOk ? "intact" : "broken"}
          </Line>
        ) : null}

        {result.replayed ? (
          <Line mark="↺" label="Duplicate" tone="approval">
            input already received, nothing written again · key {idempotencyKey}
          </Line>
        ) : null}
      </dl>
    </div>
  );
}

const TONE: Record<Exclude<IntentOutcome["status"], "error">, string> = {
  applied: "text-emerald-400",
  pending_approval: "text-amber-400",
  denied: "text-red-400",
};

const MARK_TONE = {
  allow: "text-emerald-400",
  approval: "text-amber-400",
  deny: "text-red-400",
} as const;

function Line({
  mark,
  label,
  tone = "allow",
  trailing,
  children,
}: {
  mark: string;
  label: string;
  tone?: keyof typeof MARK_TONE;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1ch_7rem_1fr_auto] items-baseline gap-x-2">
      <dt className={cn("text-center", MARK_TONE[tone])}>{mark}</dt>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
      <dd className="text-right">{trailing}</dd>
    </div>
  );
}

function Toggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="text-muted-foreground hover:text-foreground"
    >
      [{label}]
    </button>
  );
}

function headline(
  status: IntentOutcome["status"],
  tier: string | undefined,
  newStatus: string | null,
): string {
  switch (status) {
    case "applied":
      return newStatus ?? "done";
    case "pending_approval":
      return `waiting for ${tier ?? "approver"}`;
    case "denied":
      return "not allowed";
    case "error":
      return "";
  }
}

function statusLine(
  status: IntentOutcome["status"],
  before: string | null,
  after: string | null,
): string | null {
  if (status === "applied") {
    if (before && after && before !== after) return `${before} → ${after}`;
    if (!after) return null;
    return before ? `${after} unchanged` : after;
  }
  return before ? `${before} unchanged` : status === "denied" ? "unchanged" : null;
}

function versionLine(before: number | null, after: number | null): string | null {
  if (before !== null && after !== null && before !== after) return `v${before} → v${after}`;
  if (after !== null) return `v${after}`;
  if (before !== null) return `v${before}`;
  return null;
}

function policyLine(
  trace: PolicyTrace,
  denial: RuleOutcome | undefined,
  approval: RuleOutcome | undefined,
): string {
  const routed = denial ?? approval;
  if (routed && routed.type !== "allow") return `${routed.rule}: ${routed.reason}`;
  if (trace.length === 0) return "no rules apply";
  return `${trace.length} ${trace.length === 1 ? "rule" : "rules"} checked, all passed`;
}

function isApproval(o: RuleOutcome): o is Extract<RuleOutcome, { type: "require_approval" }> {
  return o.type === "require_approval";
}

function isDenial(o: RuleOutcome): o is Extract<RuleOutcome, { type: "deny" }> {
  return o.type === "deny";
}

function isPresent(value: string | null): value is string {
  return value !== null && value !== "";
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

function shortId(id: string): string {
  return id.length > 6 ? `${id.slice(0, 4)}…` : id;
}

function utc(ts: number): string {
  return `${new Date(ts).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
