"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateConstant } from "@/app/actions";
import { Button } from "@console/ui/button";
import { Input } from "@console/ui/input";
import type { ConstantDefinition } from "@console/engine/types";
import { formatUsdMinor } from "@/lib/rule-format";

type Value = ConstantDefinition["value"];

/** The value as typed: dollars for `usd_minor`, a comma-separated list for a list. */
function toInput(value: Value, unit: ConstantDefinition["unit"] | null): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number" && unit === "usd_minor") return (value / 100).toFixed(2);
  return String(value);
}

/** The typed value as the setting stores it, or a reason it can't be. */
function fromInput(
  text: string,
  type: ConstantDefinition["type"],
  unit: ConstantDefinition["unit"] | null,
): { ok: true; raw: string } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (type === "number") {
    const number = Number(trimmed.replace(/^\$/, "").replace(/,/g, ""));
    if (!Number.isFinite(number)) return { ok: false, reason: `"${text}" is not a number` };
    return { ok: true, raw: String(unit === "usd_minor" ? Math.round(number * 100) : number) };
  }
  if (type === "string_list") {
    const items = trimmed
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    return { ok: true, raw: items.join(", ") };
  }
  return { ok: true, raw: trimmed };
}

/** A setting's value as operators read it: `$500.00`, chips for a list, the number otherwise. */
export function SettingValue({
  value,
  unit,
}: {
  value: Value;
  unit: ConstantDefinition["unit"] | null;
}) {
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap justify-end gap-1" data-testid="rule-value">
        {value.length === 0 ? <span className="text-muted-foreground">none</span> : null}
        {value.map((item) => (
          <span
            key={item}
            className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-medium"
          >
            {item}
          </span>
        ))}
      </span>
    );
  }
  const text =
    typeof value === "number" && unit === "usd_minor"
      ? formatUsdMinor(value)
      : typeof value === "boolean"
        ? value
          ? "On"
          : "Off"
        : String(value);
  return (
    <span className="text-sm font-medium tabular-nums" data-testid="rule-value">
      {text}
    </span>
  );
}

/**
 * A built-in setting's value with an Edit link. Editing swaps the text for
 * one input with Save and Cancel; money is typed in dollars and stored in
 * cents. Saving goes through `updateConstant`, so it is audited.
 */
export function ConstantEditor({
  setting,
  type,
  unit,
  value,
  canEdit,
  registered,
}: {
  setting: string;
  type: ConstantDefinition["type"];
  unit: ConstantDefinition["unit"] | null;
  value: Value;
  /** Whether this viewer may change settings. */
  canEdit: boolean;
  /** False until the setting exists in the database (the next server start). */
  registered: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => toInput(value, unit));
  const [pending, startTransition] = useTransition();

  function open() {
    setText(toInput(value, unit));
    setEditing(true);
  }

  function save() {
    const parsed = fromInput(text, type, unit);
    if (!parsed.ok) {
      toast.error("Not saved", { description: parsed.reason });
      return;
    }
    startTransition(async () => {
      const result = await updateConstant(setting, parsed.raw);
      if (result.ok) {
        toast.success("Setting saved", {
          description: "It applies from the next action anyone takes.",
        });
        setEditing(false);
        router.refresh();
      } else {
        toast.error("Not saved", { description: result.reason });
      }
    });
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-3">
        <SettingValue value={value} unit={unit} />
        {canEdit ? (
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs"
            onClick={open}
            disabled={!registered}
            title={registered ? undefined : "Available once the server has registered this setting"}
            data-testid="edit-setting"
          >
            Edit
          </Button>
        ) : null}
      </span>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      data-testid="setting-editor"
    >
      <span className="relative">
        {unit === "usd_minor" ? (
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
            $
          </span>
        ) : null}
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          inputMode={type === "number" ? "decimal" : undefined}
          className={unit === "usd_minor" ? "h-8 w-36 pl-6 text-sm tabular-nums" : "h-8 w-44 text-sm"}
          aria-label={unit === "usd_minor" ? "Amount in dollars" : "Value"}
        />
      </span>
      <Button type="submit" size="sm" className="h-8" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8" disabled={pending} onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}
