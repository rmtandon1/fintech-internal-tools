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
import { GitHubMark } from "@console/ui/github-mark";
import { formatTimestamp } from "@console/ui/format";
import type { RemovalPreview } from "@console/tool-automation/removal-preview";
import { useWorkspace } from "@/components/workspace";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function PrLink({ number, url }: { number: number | null; url: string | null }) {
  if (!number) return <span>no PR</span>;
  const label = `PR #${number}`;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:underline">
      <GitHubMark className="size-3.5" />
      {label}
    </a>
  ) : (
    <span className="font-mono">{label}</span>
  );
}

/** The preview's four sections; the dialog wraps them with its buttons. */
export function RemovalPreviewBody({ preview }: { preview: RemovalPreview }) {
  return (
    <div className="space-y-4 text-sm" data-testid="removal-preview">
      <Section title="What it is">
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 italic">“{preview.request}”</p>
        <p className="text-xs text-muted-foreground">
          Asked by {preview.askedBy} · <PrLink number={preview.prNumber} url={preview.prUrl} /> · merged{" "}
          {preview.mergedAt ? formatTimestamp(preview.mergedAt) : "(not in this checkout yet)"}
        </p>
      </Section>

      <Section title="What it touched">
        {preview.files.length === 0 ? (
          <p className="text-xs text-muted-foreground">The merge commit is not in this checkout yet.</p>
        ) : (
          <ul className="space-y-0.5 text-xs" data-testid="removal-files">
            {preview.files.map((file) => (
              <li key={file.path} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                  {file.path}
                </span>
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
          {" · "}
          {preview.settings.length === 0 ? (
            "no settings declared"
          ) : (
            <>
              settings declared:{" "}
              {preview.settings.map((key, i) => (
                <span key={key}>
                  {i > 0 ? ", " : null}
                  <code className="font-mono">{key}</code>
                </span>
              ))}
            </>
          )}
        </p>
      </Section>

      <Section title="Changed since">
        {preview.changedSince.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing else has touched these files since.</p>
        ) : (
          <ul className="space-y-0.5 text-xs" data-testid="removal-later">
            {preview.changedSince.map((commit) => (
              <li key={commit.sha} className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-muted-foreground">{commit.sha.slice(0, 7)}</span>
                <span className="min-w-0 flex-1 truncate" title={commit.subject}>
                  {commit.subject}
                </span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {commit.prNumber ? `PR #${commit.prNumber}` : ""}
                </span>
                <span className="shrink-0 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-success">
                  Devin keeps these
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p data-testid="removal-next">{preview.nextStep}</p>
    </div>
  );
}

/**
 * "Remove this rule": what the merged change is, what it touched, what has
 * changed on those files since, then one button that dispatches the undo.
 * Nothing is typed; the undo carries the spec's own sentence.
 */
export function RemoveRuleDialog({
  runId,
  open,
  onOpenChange,
  initial,
}: {
  runId: string;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="remove-rule-dialog">
        <DialogHeader>
          <DialogTitle>Remove this rule</DialogTitle>
          <DialogDescription>
            Devin takes the change back out of the code and keeps everything built since.
          </DialogDescription>
        </DialogHeader>
        {result === null ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Reading the merge…</p>
        ) : result.ok ? (
          <RemovalPreviewBody preview={result.preview} />
        ) : (
          <p className="text-sm text-destructive">{result.detail}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={pending || !result?.ok} data-testid="ask-devin-to-remove">
            {pending ? "Sending…" : "Ask Devin to remove it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens the removal dialog for a merged change run. */
export function RemoveRuleButton({
  runId,
  children = "Remove…",
  ...props
}: { runId: string } & Omit<ComponentProps<typeof Button>, "onClick">) {
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
      <RemoveRuleDialog runId={runId} open={open} onOpenChange={setOpen} />
    </>
  );
}
