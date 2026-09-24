"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { revealPii } from "@/app/actions";
import { Icon } from "@console/ui/icon";

/** Masked by default; revealing calls the server and writes an audit event. */
export function RevealField({
  tool,
  recordId,
  field,
  masked,
  canReveal,
}: {
  tool: string;
  recordId: string;
  field: string;
  masked: string;
  canReveal: boolean;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onReveal() {
    startTransition(async () => {
      const result = await revealPii(tool, recordId, field);
      if (result.ok) {
        setValue(result.value);
        toast.info("Revealed", { description: "This reveal was written to the audit log." });
      } else {
        toast.error("Cannot reveal", { description: result.reason });
      }
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={value ? undefined : "font-mono"}>{value ?? masked}</span>
      {canReveal && !value ? (
        <button
          type="button"
          onClick={onReveal}
          disabled={pending}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title="Reveal (audited)"
        >
          <Icon name="Eye" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
