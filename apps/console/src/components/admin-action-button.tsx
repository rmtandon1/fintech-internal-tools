"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { submitIntent } from "@/app/actions";
import { Button } from "@console/ui/button";

/**
 * A tool-wide admin action from the Rules panel. It goes through
 * `submitIntent` like any other action, so the engine's rules apply and the
 * audit chain records it; there is just no record.
 */
export function AdminActionButton({ tool, action, label }: { tool: string; action: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run() {
    startTransition(async () => {
      const form = new FormData();
      form.set("tool", tool);
      form.set("action", action);
      const { outcome } = await submitIntent(form);
      if (outcome.status === "applied") toast.success(label, { description: outcome.summary });
      else if (outcome.status === "pending_approval") toast.info("Sent for approval", { description: outcome.reason });
      else if (outcome.status === "denied") toast.error("Not allowed", { description: outcome.reason });
      else toast.error("Failed", { description: outcome.message });
      router.refresh();
    });
  }
  return (
    <Button size="sm" variant="secondary" className="h-7 text-xs" disabled={pending} onClick={run} data-testid="admin-action">
      {pending ? "Running…" : label}
    </Button>
  );
}
