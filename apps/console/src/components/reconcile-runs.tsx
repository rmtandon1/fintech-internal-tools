"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { reconcileAutomationRuns } from "@/app/automation-actions";
import { Button } from "@console/ui/button";

/** Engineer-only button on `/t/automation`: confirm approved runs against GitHub, then pull. */
export function ReconcileRuns() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-6 px-2 text-[11px]"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reconcileAutomationRuns();
          if (result.ok) toast.success(result.title, { description: result.detail });
          else toast.error(result.title, { description: result.detail });
          if (result.reload) router.refresh();
        })
      }
    >
      {pending ? "Reconciling…" : "Reconcile"}
    </Button>
  );
}
