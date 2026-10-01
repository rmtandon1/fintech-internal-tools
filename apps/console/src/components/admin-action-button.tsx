"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordLabels, submitIntent } from "@/app/actions";
import { needsAttention, parseActionSummary, sentToManager, statusLabel } from "@/lib/action-summary";
import { Button } from "@console/ui/button";
import { cn } from "@console/ui/utils";

interface ResultItem {
  id: string;
  label: string;
  status: string;
  attention: boolean;
  toManager: boolean;
}

type Result = { tone: "ok" | "info" | "error"; text: string; headline?: string; items?: ResultItem[] };

/**
 * A tool-wide action from a rule's card, such as "Recheck now". It goes
 * through `submitIntent` like any other action, so the engine's rules apply
 * and the audit chain records it; there is just no record. What came back
 * stays under the button: when the summary lists records with a result each,
 * they are listed by name, the ones that need a person first, each linking to
 * its record.
 */
export function AdminActionButton({ tool, action, label }: { tool: string; action: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  function run() {
    startTransition(async () => {
      const form = new FormData();
      form.set("tool", tool);
      form.set("action", action);
      const { outcome } = await submitIntent(form);
      if (outcome.status === "applied") {
        const parsed = parseActionSummary(outcome.summary);
        if (parsed) {
          const names = new Map(
            (await recordLabels(tool, parsed.items.map((item) => item.id))).map((r) => [r.id, r.label]),
          );
          const items = parsed.items
            .map((item) => ({
              ...item,
              label: names.get(item.id) ?? item.id,
              attention: needsAttention(item.status),
              toManager: sentToManager(item.status),
            }))
            .sort((a, b) => Number(b.attention) - Number(a.attention));
          toast.success(label, { description: parsed.headline });
          setResult({ tone: "ok", text: outcome.summary, headline: parsed.headline, items });
        } else {
          toast.success(label, { description: outcome.summary });
          setResult({ tone: "ok", text: outcome.summary });
        }
      } else if (outcome.status === "pending_approval") {
        toast.info("Sent for approval", { description: outcome.reason });
        setResult({ tone: "info", text: `Sent for approval: ${outcome.reason}` });
      } else if (outcome.status === "denied") {
        toast.error("Not allowed", { description: outcome.reason });
        setResult({ tone: "error", text: outcome.reason });
      } else {
        toast.error("Failed", { description: outcome.message });
        setResult({ tone: "error", text: outcome.message });
      }
      router.refresh();
    });
  }
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={run} data-testid="admin-action">
        {pending ? "Running…" : label}
      </Button>
      {result?.items ? (
        <div className="w-full max-w-xl rounded-md border border-border bg-background px-3 py-2" data-testid="admin-action-result">
          <p className="text-xs font-medium text-muted-foreground">{result.headline}</p>
          <ul className="mt-1.5 space-y-1">
            {result.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="admin-action-item">
                <Link
                  href={`/t/${tool}/${item.id}`}
                  className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                >
                  {item.label}
                </Link>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    item.attention
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-success/30 bg-success/10 text-success",
                  )}
                >
                  {statusLabel(item.status)}
                </span>
                {item.toManager ? <span className="text-xs text-muted-foreground">sent to a manager</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : result ? (
        <p
          className={cn(
            "text-xs",
            result.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          data-testid="admin-action-result"
        >
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
