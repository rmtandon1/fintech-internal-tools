"use client";

import { useState } from "react";
import { Textarea } from "@console/ui/textarea";

/**
 * A message box that offers a short ready-made message as grey text. Tab
 * fills it in while the box is empty or holds the start of it; typing
 * anything else leaves the person's own words alone. Works controlled (pass
 * `value` and `onChange`) or uncontrolled.
 */
export function SuggestTextarea({
  suggestion,
  value: controlled,
  onChange,
  rows = 3,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  suggestion: string | null | undefined;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [own, setOwn] = useState("");
  const value = controlled ?? own;
  const set = (next: string) => {
    if (controlled === undefined) setOwn(next);
    onChange?.(next);
  };
  const offer =
    !!suggestion &&
    value !== suggestion &&
    suggestion.toLowerCase().startsWith(value.toLowerCase());

  return (
    <div className="relative">
      <Textarea
        {...props}
        rows={rows}
        value={value}
        placeholder={suggestion ?? props.placeholder}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !e.shiftKey && offer && suggestion) {
            e.preventDefault();
            set(suggestion);
          }
        }}
        className={offer ? "pr-16" : undefined}
      />
      {offer ? (
        <kbd className="pointer-events-none absolute right-2 bottom-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          Tab
        </kbd>
      ) : null}
    </div>
  );
}
