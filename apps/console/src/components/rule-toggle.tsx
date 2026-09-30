"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateConstant } from "@/app/actions";
import { Switch } from "@console/ui/switch";
import { cn } from "@console/ui/utils";

/**
 * A rule's On/Off switch: its boolean setting, written through
 * `updateConstant` so the flip is audited. Applies straight away; the page
 * refreshes so the queue follows.
 */
export function RuleToggle({
  setting,
  name,
  on,
  canEdit,
  disabled = false,
  reason,
}: {
  setting: string;
  name: string;
  on: boolean;
  /** Whether this viewer may switch rules. */
  canEdit: boolean;
  /** Greyed out, e.g. while Devin is removing the rule. */
  disabled?: boolean;
  /** Why it can't be switched right now, as a tooltip. */
  reason?: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(on);
  const [pending, startTransition] = useTransition();
  useEffect(() => setChecked(on), [on]);

  function flip(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await updateConstant(setting, String(next));
      if (result.ok) {
        toast.success(`${name} is ${next ? "on" : "off"}`, {
          description: "Applies straight away and is logged.",
        });
        router.refresh();
      } else {
        setChecked(!next);
        toast.error("Not changed", { description: result.reason });
      }
    });
  }

  const blocked = disabled || !canEdit;
  return (
    <label
      className={cn("flex items-center gap-2 text-xs font-medium", blocked && "text-muted-foreground")}
      title={reason ?? (canEdit ? undefined : "Managers and admins switch rules")}
    >
      <span className="w-6 text-right" data-testid="rule-on-off">
        {checked ? "On" : "Off"}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={flip}
        disabled={blocked || pending}
        aria-label={`${name} on or off`}
        data-testid="rule-toggle"
      />
    </label>
  );
}
