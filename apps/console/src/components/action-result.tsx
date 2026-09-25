"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SubmitResult } from "@/app/actions";
import type { RuleOutcome, StatusDecl } from "@console/engine/types";
import { Icon } from "@console/ui/icon";
import { ruleLabel } from "@console/ui/policy-trace";
import { cn } from "@console/ui/utils";

/** How long each check line takes to appear, so the sequence can be followed. */
const STEP_MS = 420;

type Tone = "pass" | "approval" | "block" | "info";

interface Step {
  tone: Tone;
  text: string;
  detail?: string;
}

const TONE: Record<Tone, { icon: string; className: string }> = {
  pass: { icon: "Check", className: "text-emerald-400" },
  approval: { icon: "UserCheck", className: "text-amber-400" },
  block: { icon: "Ban", className: "text-red-400" },
  info: { icon: "RotateCcw", className: "text-sky-400" },
};

/**
 * What happened after an action was submitted, played back one check at a
 * time: permission, each rule in the order it ran, then the audit write.
 * The result sentence appears once every check has shown. Nothing here is
 * tool-specific; labels come from the tool declaration.
 */
export function ActionResult({
  result,
  actionLabel,
  recordId,
  idempotencyKey,
  statuses,
  ruleLabels,
}: {
  /** Null while the request is still with the server. */
  result: SubmitResult | null;
  actionLabel: string;
  recordId: string | null;
  idempotencyKey: string;
  statuses: StatusDecl[];
  ruleLabels?: Record<string, string>;
}) {
  const steps = result ? stepsFor(result, actionLabel, ruleLabels) : [];
  const [shown, setShown] = useState(0);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    setShown(0);
    if (!result) return;
    const total = stepsFor(result, actionLabel, ruleLabels).length;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setShown(count);
      if (count >= total) clearInterval(timer);
    }, STEP_MS);
    return () => clearInterval(timer);
    // Replays only for a new result. The labels arrive as fresh objects on
    // every server refresh, and depending on them would restart the playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const done = result !== null && shown >= steps.length;

  return (
    <div className="space-y-4" data-testid="action-result">
      <ol className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-4">
        {steps.slice(0, shown).map((step, index) => {
          const tone = TONE[step.tone];
          return (
            <li
              key={index}
              className="flex items-start gap-3 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              <Icon name={tone.icon} className={cn("mt-0.5 size-4 shrink-0", tone.className)} />
              <span className="min-w-0">
                <span className="text-foreground">{step.text}</span>
                {step.detail ? (
                  <span className="block text-[13px] text-muted-foreground">{step.detail}</span>
                ) : null}
              </span>
            </li>
          );
        })}
        {!done ? (
          <li className="flex items-center gap-3 text-sm text-muted-foreground">
            <Icon name="Loader2" className="size-4 shrink-0 animate-spin" />
            {result ? "Checking…" : "Sending…"}
          </li>
        ) : null}
      </ol>

      {done && result ? (
        <div className="space-y-3 animate-in fade-in duration-300">
          <Verdict result={result} statuses={statuses} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {result.audit && recordId ? (
              <Link
                href={`/audit?recordId=${encodeURIComponent(recordId)}`}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                View in audit log
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setDetails((open) => !open)}
              aria-expanded={details}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              {details ? "Hide technical details" : "Technical details"}
            </button>
          </div>
          {details ? (
            <TechnicalDetails result={result} idempotencyKey={idempotencyKey} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function stepsFor(
  result: SubmitResult,
  actionLabel: string,
  labels: Record<string, string> | undefined,
): Step[] {
  const { outcome } = result;
  const steps: Step[] = [];
  if (result.replayed) {
    steps.push({
      tone: "info",
      text: "Already submitted",
      detail: "This exact request was already received, so nothing was done twice.",
    });
  }
  if (outcome.status === "error") {
    steps.push({ tone: "block", text: "Could not complete", detail: outcome.message });
    return steps;
  }
  steps.push({ tone: "pass", text: `Your role can ${actionLabel.toLowerCase()}` });
  for (const rule of outcome.trace) steps.push(ruleStep(rule, labels));
  steps.push({
    tone: "pass",
    text:
      outcome.status === "applied"
        ? "Recorded in the audit log"
        : outcome.status === "pending_approval"
          ? "Request recorded in the audit log"
          : "Attempt recorded in the audit log",
  });
  return steps;
}

function ruleStep(outcome: RuleOutcome, labels: Record<string, string> | undefined): Step {
  const text = ruleLabel(outcome.rule, labels);
  switch (outcome.type) {
    case "allow":
      return { tone: "pass", text, detail: outcome.message };
    case "require_approval":
      return { tone: "approval", text, detail: outcome.reason };
    case "deny":
      return { tone: "block", text, detail: outcome.reason };
  }
}

function Verdict({ result, statuses }: { result: SubmitResult; statuses: StatusDecl[] }) {
  const { outcome, audit } = result;
  const field = audit?.statusField;
  const before = field ? label(statuses, audit?.before?.[field]) : null;
  const after = field ? label(statuses, audit?.after?.[field]) : null;

  switch (outcome.status) {
    case "applied":
      return (
        <Banner tone="pass" title="Done">
          {before && after && before !== after ? (
            <>
              Status changed from <strong>{before}</strong> to <strong>{after}</strong>.
            </>
          ) : null}
        </Banner>
      );
    case "pending_approval": {
      const approval = outcome.trace.find((o) => o.type === "require_approval");
      const tier = approval && approval.type === "require_approval" ? approval.tier : "an approver";
      return (
        <Banner tone="approval" title={`Sent to ${tier} for approval`}>
          {outcome.reason}.{before ? <> It stays <strong>{before}</strong> until they decide.</> : null}
        </Banner>
      );
    }
    case "denied":
      return (
        <Banner tone="block" title="Not allowed">
          {outcome.reason}. Nothing was changed.
        </Banner>
      );
    case "error":
      return (
        <Banner tone="block" title="Nothing was changed">
          {outcome.message}
        </Banner>
      );
  }
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: Exclude<Tone, "info">;
  title: string;
  children?: React.ReactNode;
}) {
  const styles = {
    pass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    approval: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    block: "border-red-500/30 bg-red-500/10 text-red-300",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-4 py-3", styles)}>
      <div className="text-base font-semibold">{title}</div>
      {children ? <p className="mt-0.5 text-sm text-foreground/80">{children}</p> : null}
    </div>
  );
}

function TechnicalDetails({
  result,
  idempotencyKey,
}: {
  result: SubmitResult;
  idempotencyKey: string;
}) {
  const { outcome, audit } = result;
  const trace = outcome.trace ?? [];
  const versionBefore = audit?.before?.version;
  const versionAfter = audit?.after?.version;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border p-3 font-mono text-[11px] text-muted-foreground">
      {trace.length > 0 ? (
        <>
          <dt>rules</dt>
          <dd className="break-words text-foreground">
            {trace.map((o) => `${o.rule}=${o.type}`).join(", ")}
          </dd>
        </>
      ) : null}
      {audit ? (
        <>
          <dt>audit</dt>
          <dd className="text-foreground">
            #{audit.seq} · {audit.event} · {audit.rowHash.slice(0, 12)}… · chain{" "}
            {audit.chainOk ? "intact" : "broken"}
          </dd>
          <dt>actor</dt>
          <dd className="text-foreground">
            {audit.actorId} ({audit.actorRole})
          </dd>
        </>
      ) : null}
      {typeof versionBefore === "number" || typeof versionAfter === "number" ? (
        <>
          <dt>version</dt>
          <dd className="text-foreground">
            {typeof versionBefore === "number" ? `v${versionBefore}` : "—"}
            {typeof versionAfter === "number" && versionAfter !== versionBefore
              ? ` → v${versionAfter}`
              : ""}
          </dd>
        </>
      ) : null}
      {outcome.status === "pending_approval" ? (
        <>
          <dt>approval</dt>
          <dd className="text-foreground">{outcome.approvalId}</dd>
        </>
      ) : null}
      <dt>request key</dt>
      <dd className="break-all text-foreground">{idempotencyKey}</dd>
    </dl>
  );
}

function label(statuses: StatusDecl[], value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return statuses.find((s) => s.value === value)?.label ?? value;
}
