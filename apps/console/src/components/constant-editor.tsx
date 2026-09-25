"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateConstant } from "@/app/actions";
import { Button } from "@console/ui/button";
import { Input } from "@console/ui/input";
import type { ConstantRow } from "@console/engine/policy/constants";
import { formatRelative, humanize } from "@console/ui/format";

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
        toast.success("Setting saved", {
          description: "It applies from the next action anyone takes.",
        });
      } else {
        toast.error("Not saved", { description: result.reason });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{constant.description}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {humanize(constant.tool)} · changed {formatRelative(constant.updatedAt)} by{" "}
          {constant.updatedBy}
          <span className="ml-2 font-mono text-[11px] text-muted-foreground/60">{constant.key}</span>
        </p>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-56"
      />
      <Button size="sm" disabled={!dirty || pending} onClick={save}>
        Save
      </Button>
    </div>
  );
}
