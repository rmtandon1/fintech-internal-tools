"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { submitIntent } from "@/app/actions";
import { Button } from "@console/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@console/ui/dialog";
import { Input } from "@console/ui/input";
import { Label } from "@console/ui/label";
import { Switch } from "@console/ui/switch";
import { Textarea } from "@console/ui/textarea";
import type { InputFieldDesc } from "@console/engine/policy/preview";
import { titleCase } from "@console/ui/format";

export interface ToggleItem {
  recordId: string;
  name: string;
  href: string;
  checked: boolean;
  /** The action that flips this switch from its current state. */
  action: string;
  actionLabel: string;
  available: boolean;
  unavailableReason?: string;
  inputFields: InputFieldDesc[];
}

/**
 * One compact row: the record's name and a switch. Flipping the switch asks
 * for the action's inputs (a reason, usually), then submits the action. The
 * switch only moves once the change is applied; a change that needs approval
 * stays put and says who it went to.
 */
export function ToggleSwitch({ tool, item }: { tool: string; item: ToggleItem }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => ulid());

  function onSubmit(form: FormData) {
    startTransition(async () => {
      form.set("idempotencyKey", idempotencyKey);
      const { outcome } = await submitIntent(form);
      setIdempotencyKey(ulid());
      switch (outcome.status) {
        case "applied":
          setOpen(false);
          toast.success(`${item.name} is ${item.checked ? "off" : "on"}`);
          break;
        case "pending_approval":
          setOpen(false);
          toast("Sent for approval", { description: outcome.reason });
          break;
        case "denied":
          toast.error("Not allowed", { description: outcome.reason });
          break;
        case "error":
          toast.error(titleCase(outcome.code), { description: outcome.message });
          break;
      }
    });
  }

  return (
    <div
      className="flex h-12 items-center gap-3 rounded-lg border border-border bg-card px-3.5 shadow-xs transition-colors hover:border-ring/50"
      title={item.available ? undefined : item.unavailableReason}
    >
      <Link
        href={item.href}
        className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
      >
        {item.name}
      </Link>
      <Switch
        checked={item.checked}
        disabled={!item.available || pending}
        onCheckedChange={() => setOpen(true)}
        aria-label={`${item.actionLabel} ${item.name}`}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {item.actionLabel} {item.name}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Your reason is kept with the change. If the change needs approval, it goes
              to an approver first.
            </DialogDescription>
          </DialogHeader>
          <form action={onSubmit} className="space-y-3">
            <input type="hidden" name="tool" value={tool} />
            <input type="hidden" name="action" value={item.action} />
            <input type="hidden" name="recordId" value={item.recordId} />
            {item.inputFields.map((field) => {
              const id = `${item.recordId}-${field.name}`;
              const type = field.type === "number" ? "number" : "string";
              const name = `input:${type}${field.optional ? "?" : ""}:${field.name}`;
              return (
                <div key={field.name} className="space-y-1">
                  <Label htmlFor={id} className="text-xs text-muted-foreground">
                    {titleCase(field.name)}
                    {field.optional ? " (optional)" : ""}
                  </Label>
                  {type === "string" ? (
                    <Textarea id={id} name={name} rows={3} className="text-sm" autoFocus />
                  ) : (
                    <Input id={id} name={name} type="number" className="h-7 text-xs" />
                  )}
                </div>
              );
            })}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                variant={item.checked ? "destructive" : "default"}
                disabled={pending}
                className="h-8"
              >
                {item.actionLabel}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
