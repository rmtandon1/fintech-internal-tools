"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateConstant } from "@/app/actions";
import { Button } from "@console/ui/button";
import { Input } from "@console/ui/input";
import type { ConstantRow } from "@console/engine/policy/constants";
import { formatRelative } from "@console/ui/format";

export function ConstantEditor({ constant }: { constant: ConstantRow }) {
  const initial = Array.isArray(constant.value)
    ? constant.value.join(", ")
    : String(constant.value);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = value !== initial;

  function save() {
    startTransition(async () => {
      const result = await updateConstant(constant.key, value);
      if (result.ok) {
        toast.success(`${constant.key} updated`, {
          description: "Takes effect on the next policy evaluation.",
        });
      } else {
        toast.error("Not updated", { description: result.reason });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs">{constant.key}</div>
        <p className="text-xs text-muted-foreground">{constant.description}</p>
        <p className="text-[11px] text-muted-foreground/70">
          {constant.tool} · {constant.type} · updated {formatRelative(constant.updatedAt)} by{" "}
          {constant.updatedBy}
        </p>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-56 text-xs"
      />
      <Button size="sm" disabled={!dirty || pending} onClick={save}>
        Save
      </Button>
    </div>
  );
}
