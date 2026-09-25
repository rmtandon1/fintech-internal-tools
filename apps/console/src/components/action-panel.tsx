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
      const key = String(form.get("idempotencyKey"));
      const result = await submitIntent(form);
      const outcome = result.outcome;
      onSubmitted({ action: preview.action, idempotencyKey: key, result });
      // Only a completed submission closes the dialog; on a denial the
      // entered values stay put so the operator can fix and retry.
      if (outcome.status === "applied" || outcome.status === "pending_approval") {
        setDialogOpen(false);
      }
      // A denial or error may be retried with a different payload, which needs
      // a fresh key. A completed submission keeps its key so an identical
      // resubmit replays the stored result instead of writing twice.
      if (outcome.status === "denied" || outcome.status === "error") {
        setIdempotencyKey(ulid());
      }
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
