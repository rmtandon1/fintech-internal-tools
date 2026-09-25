"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { submitIntent, type SubmitResult } from "@/app/actions";
import { ActionOutcome } from "@/components/action-outcome";
import { Button } from "@console/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@console/ui/dialog";
import { Input } from "@console/ui/input";
import { Label } from "@console/ui/label";
import { Textarea } from "@console/ui/textarea";
import type { ActionPreview } from "@console/engine/policy/preview";
import { titleCase } from "@console/ui/format";

interface Submission {
  action: string;
  idempotencyKey: string;
  result: SubmitResult;
}

export function ActionBar({
  tool,
  recordId,
  previews,
}: {
  tool: string;
  recordId: string | null;
  previews: ActionPreview[];
}) {
  // The last outcome stays docked here until the next action or navigation.
  const [last, setLast] = useState<Submission | null>(null);

  if (previews.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        No actions are declared for this tool.
      </p>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2">
      {last && last.result.outcome.status !== "error" ? (
        <ActionOutcome
          result={last.result}
          tool={tool}
          action={last.action}
          recordId={recordId}
          idempotencyKey={last.idempotencyKey}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {previews.map((preview) => (
          <ActionButton
            key={preview.action}
            tool={tool}
            recordId={recordId}
            preview={preview}
            onSubmitted={setLast}
          />
        ))}
      </div>
    </div>
  );
}

function approvalTier(preview: ActionPreview): string {
  const outcome = preview.decision?.trace.find(
    (o) => o.type === "require_approval",
  );
  return outcome && outcome.type === "require_approval"
    ? outcome.tier
    : "approval";
}

/** The submitted input fields, in a stable order, as the engine will hash them. */
function payloadOf(form: FormData): string {
  const entries = Array.from(form.entries())
    .filter(([key]) => key.startsWith("input:"))
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function ActionButton({
  tool,
  recordId,
  preview,
  onSubmitted,
}: {
  tool: string;
  recordId: string | null;
  preview: ActionPreview;
  onSubmitted: (submission: Submission) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => ulid());
  // The last completed submission, so the same payload sent again replays it
  // while a changed payload goes out under a fresh key.
  const [completed, setCompleted] = useState<{ key: string; payload: string } | null>(null);

  const denied = preview.decision?.effect === "deny";
  const needsApproval = preview.decision?.effect === "require_approval";
  const disabled = !preview.offered || denied || pending;
  const title = !preview.offered
    ? preview.unavailableReason
    : denied
      ? preview.decision?.reason
      : undefined;

  const label = needsApproval
    ? `${preview.label} → ${approvalTier(preview)}`
    : preview.label;
  const variant =
    preview.tone === "destructive"
      ? ("destructive" as const)
      : needsApproval
        ? ("secondary" as const)
        : ("default" as const);

  function onSubmit(form: FormData) {
    startTransition(async () => {
      const payload = payloadOf(form);
      const key = completed?.payload === payload ? completed.key : idempotencyKey;
      form.set("idempotencyKey", key);
      const result = await submitIntent(form);
      const outcome = result.outcome;
      onSubmitted({ action: preview.action, idempotencyKey: key, result });
      // Only a completed submission closes the dialog; on a denial the
      // entered values stay put so the operator can fix and retry.
      if (outcome.status === "applied" || outcome.status === "pending_approval") {
        setDialogOpen(false);
        setCompleted({ key, payload });
      }
      setIdempotencyKey(ulid());
      if (outcome.status === "error") {
        toast.error(titleCase(outcome.code), { description: outcome.message });
      }
    });
  }

  const hiddenFields = (
    <>
      <input type="hidden" name="tool" value={tool} />
      <input type="hidden" name="action" value={preview.action} />
      {recordId ? <input type="hidden" name="recordId" value={recordId} /> : null}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </>
  );

  if (preview.inputFields.length === 0) {
    return (
      <form action={onSubmit}>
        {hiddenFields}
        <Button
          type="submit"
          size="sm"
          variant={variant}
          disabled={disabled}
          title={title}
          className="h-7 text-xs"
        >
          {label}
        </Button>
      </form>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={variant}
          disabled={disabled}
          title={title}
          className="h-7 text-xs"
        >
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{preview.label}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-3">
          {hiddenFields}
          {preview.inputFields.map((field) => (
            // `input:<type><?>:<name>`: the marker tells the server a blank
            // value means "not supplied" rather than an empty value.
            <div key={field.name} className="space-y-1">
              <Label
                htmlFor={`${preview.action}-${field.name}`}
                className="text-[11px] text-muted-foreground"
              >
                {titleCase(field.name)}
                {field.optional ? " (optional)" : ""}
              </Label>
              {field.type === "string" && field.name.includes("reason") ? (
                <Textarea
                  id={`${preview.action}-${field.name}`}
                  name={`input:string${field.optional ? "?" : ""}:${field.name}`}
                  rows={2}
                  className="text-xs"
                />
              ) : field.type === "enum" ? (
                <select
                  id={`${preview.action}-${field.name}`}
                  name={`input:string${field.optional ? "?" : ""}:${field.name}`}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  {field.optional ? <option value="">—</option> : null}
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  id={`${preview.action}-${field.name}`}
                  name={`input:boolean${field.optional ? "?" : ""}:${field.name}`}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  {field.optional ? <option value="">—</option> : null}
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <Input
                  id={`${preview.action}-${field.name}`}
                  name={`input:${field.type === "number" ? "number" : "string"}${field.optional ? "?" : ""}:${field.name}`}
                  type={field.type === "number" ? "number" : "text"}
                  className="h-7 text-xs"
                />
              )}
            </div>
          ))}
          <Button
            type="submit"
            size="sm"
            variant={variant}
            disabled={disabled}
            className="h-7 text-xs"
          >
            {label}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
