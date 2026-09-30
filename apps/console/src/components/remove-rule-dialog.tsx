"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ComponentProps } from "react";
import { toast } from "sonner";
import {
  dispatchAutomationRun,
  previewRuleRemoval,
  type RemovalPreviewResult,
} from "@/app/automation-actions";
import { Button } from "@console/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@console/ui/dialog";
import type { RemovalPreview } from "@console/tool-automation/removal-preview";
import { PrButton } from "@/components/pr-button";
import { useWorkspace } from "@/components/workspace";
import { formatDay } from "@/lib/rule-format";

/** What the rule's card knows about it; the dialog shows this while the merge is read. */
export interface RemovableRule {
  name: string;
  prNumber: number | null;
  prUrl: string | null;
  /** When it was asked for. */
  askedAt: number;
  /** Whether its switch is on right now; null when the rule has no switch. */
  on: boolean | null;
}

export const WHAT_HAPPENS = [
  "Devin opens a pull request that takes the rule out of the code.",
  "An engineer reviews it and merges it on GitHub.",
  "Once merged, requests this rule holds go back to the analyst.",
];

/** The files and tests the merge touched, folded away for engineers. */
export function EngineeringDetail({ preview }: { preview: RemovalPreview }) {
  return (
    <details className="group rounded-md border border-border text-sm" data-testid="engineering-detail">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        <span className="transition-transform group-open:rotate-90">▸</span>
        Engineering detail
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-2">
        {preview.files.length === 0 ? (
          <p className="text-xs text-muted-foreground">The merge commit is not in this checkout yet.</p>
        ) : (
          <ul className="space-y-0.5 text-xs" data-testid="removal-files">
            {preview.files.map((file) => (
              <li key={file.path} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 break-all font-mono">{file.path}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  <span className="text-emerald-500">+{file.additions}</span>{" "}
                  <span className="text-red-500">−{file.deletions}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {preview.tests.length === 0
            ? "No tests added or changed"
            : `${preview.tests.length} test file${preview.tests.length === 1 ? "" : "s"} added or changed`}
          {" · merge "}
          <code className="font-mono">{preview.mergeCommit.slice(0, 7)}</code>
          {" · run "}
          <code className="font-mono">{preview.runId}</code>
        </p>
      </div>
    </details>
  );
}

/** The request as it was asked, then what happens; the detail folded. */
export function RemovalPreviewBody({
  preview,
  rule,
}: {
  preview: RemovalPreview;
  rule?: RemovableRule | null;
}) {
  return (
    <div className="space-y-4 text-sm" data-testid="removal-preview">
      <Provenance
        rule={
          rule ?? {
            name: "",
            prNumber: preview.prNumber,
            prUrl: preview.prUrl,
            askedAt: preview.mergedAt ?? 0,
            on: null,
          }
        }
        askedBy={preview.askedBy}
      />
      <Request text={preview.request} />
      <WhatHappens />
      <EngineeringDetail preview={preview} />
    </div>
  );
}

function Provenance({ rule, askedBy }: { rule: RemovableRule; askedBy?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="removal-provenance">
      <span>Added by Devin{askedBy ? ` · asked by ${askedBy}` : ""} ·</span>
      <PrButton number={rule.prNumber} url={rule.prUrl} />
      {rule.askedAt > 0 ? <span>· {formatDay(rule.askedAt)}</span> : null}
      {rule.on !== null ? (
        <span
          className="ml-auto inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
          data-testid="removal-current-state"
        >
          {rule.on ? "On" : "Off"}
        </span>
      ) : null}
    </div>
  );
}

function Request({ text }: { text: string }) {
  return (
    <blockquote className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm italic leading-relaxed break-words">
      “{text}”
    </blockquote>
  );
}

function WhatHappens() {
  return (
    <section className="space-y-1.5" data-testid="removal-what-happens">
      <h3 className="text-sm font-semibold">What happens</h3>
      <ul className="space-y-1 pl-4 text-sm text-muted-foreground">
        {WHAT_HAPPENS.map((line) => (
          <li key={line} className="list-disc break-words">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Remove <rule>?": what the rule is, in the requester's words, what happens
 * when Devin takes it out, and one red button that starts the undo run.
 * Nothing is typed; the undo carries the spec's own sentence.
 */
export function RemoveRuleDialog({
  runId,
  rule,
  open,
  onOpenChange,
  initial,
}: {
  runId: string;
  /** The rule's card details; the run page passes none and the dialog reads the merge. */
  rule?: RemovableRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A preview already in hand (tests); otherwise read when the dialog opens. */
  initial?: RemovalPreviewResult | null;
}) {
  const router = useRouter();
  const { setAgentFocus } = useWorkspace();
  const [result, setResult] = useState<RemovalPreviewResult | null>(initial ?? null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || initial) return;
    let cancelled = false;
    setResult(null);
    void previewRuleRemoval(runId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, runId, initial]);

  function send() {
    if (!result?.ok) return;
    const { spec, undoIntent } = result;
    startTransition(async () => {
      const form = new FormData();
      form.set("spec", spec);
      form.set("operation", "undo");
      form.set("intent", undoIntent);
      form.set("reverses", runId);
      const outcome = await dispatchAutomationRun(form);
      if (outcome.ok) {
        toast.success(outcome.title, { description: outcome.detail });
        onOpenChange(false);
        if (outcome.runId) setAgentFocus({ kind: "run", runId: outcome.runId });
        router.refresh();
      } else {
        toast.error(outcome.title, { description: outcome.detail });
      }
    });
  }

  const name = rule?.name ?? "this rule";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto overflow-x-hidden sm:max-w-[520px]"
        data-testid="remove-rule-dialog"
      >
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base break-words">Remove {name}?</DialogTitle>
          <DialogDescription className="sr-only">
            Ask Devin to take {name} out of the code.
          </DialogDescription>
        </DialogHeader>
        {result === null ? (
          <div className="space-y-4 text-sm">
            {rule ? <Provenance rule={rule} /> : null}
            <p className="py-4 text-center text-xs text-muted-foreground">Reading the merge…</p>
          </div>
        ) : result.ok ? (
          <RemovalPreviewBody preview={result.preview} rule={rule} />
        ) : (
          <div className="space-y-4 text-sm">
            {rule ? <Provenance rule={rule} /> : null}
            <WhatHappens />
            <p className="text-xs text-destructive break-words" data-testid="removal-error">
              {result.detail}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={send}
            disabled={pending || !result?.ok}
            data-testid="ask-devin-to-remove"
          >
            {pending ? "Sending…" : "Remove rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens the removal dialog for a merged change run. */
export function RemoveRuleButton({
  runId,
  rule,
  children = "Remove…",
  ...props
}: { runId: string; rule?: RemovableRule | null } & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        {...props}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid="remove-rule"
      >
        {children}
      </Button>
      <RemoveRuleDialog runId={runId} rule={rule} open={open} onOpenChange={setOpen} />
    </>
  );
}
