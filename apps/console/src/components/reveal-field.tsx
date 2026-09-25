"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { revealPii } from "@/app/actions";

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
    <div className="flex items-center gap-2 text-xs">
      <span className={value ? undefined : "font-mono"}>{value ?? masked}</span>
      {canReveal && !value ? (
        <button
          type="button"
          onClick={onReveal}
          disabled={pending}
          className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
          title="Reveal (audited)"
        >
          reveal
        </button>
      ) : null}
    </div>
  );
}
