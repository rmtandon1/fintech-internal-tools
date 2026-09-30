"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitIntent } from "@/app/actions";
import { Button } from "@console/ui/button";
import { cn } from "@console/ui/utils";

type Result = { tone: "ok" | "info" | "error"; text: string };

/**
 * A tool-wide action from a rule's card, such as "Recheck now". It goes
 * through `submitIntent` like any other action, so the engine's rules apply
 * and the audit chain records it; there is just no record. What came back
 * stays under the button.
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
        toast.success(label, { description: outcome.summary });
        setResult({ tone: "ok", text: outcome.summary });
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
    <div className="flex flex-col items-start gap-1.5">
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={run} data-testid="admin-action">
        {pending ? "Running…" : label}
      </Button>
      {result ? (
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
