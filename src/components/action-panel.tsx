"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { submitIntent } from "@/app/actions";
import { PolicyOutcomeLine, PolicyTraceList } from "@/components/policy-trace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionPreview } from "@/engine/policy/preview";
import { titleCase } from "@/lib/format";

export function ActionPanel({
  tool,
  recordId,
  previews,
}: {
  tool: string;
  recordId: string | null;
  previews: ActionPreview[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {previews.map((preview) => (
          <ActionForm
            key={preview.action}
            tool={tool}
            recordId={recordId}
            preview={preview}
          />
        ))}
        {previews.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No actions are declared for this tool.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActionForm({
  tool,
  recordId,
  preview,
}: {
  tool: string;
  recordId: string | null;
  preview: ActionPreview;
}) {
  const [pending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => ulid());
  const [showTrace, setShowTrace] = useState(false);

  const denied = preview.decision?.effect === "deny";
  const needsApproval = preview.decision?.effect === "require_approval";
  const disabled = !preview.offered || denied || pending;

  function onSubmit(form: FormData) {
    startTransition(async () => {
      const result = await submitIntent(form);
      setIdempotencyKey(ulid());
      const outcome = result.outcome;
      if (outcome.status === "applied") {
        toast.success(outcome.summary, {
          description: result.replayed ? "Replayed from idempotency key" : undefined,
        });
      } else if (outcome.status === "pending_approval") {
        toast.info("Sent for approval", { description: outcome.reason });
      } else if (outcome.status === "denied") {
        toast.error("Denied by policy", { description: outcome.reason });
      } else {
        toast.error(titleCase(outcome.code), { description: outcome.message });
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-2 rounded-lg border border-border p-3">
      <input type="hidden" name="tool" value={tool} />
      <input type="hidden" name="action" value={preview.action} />
      {recordId ? <input type="hidden" name="recordId" value={recordId} /> : null}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{preview.label}</div>
          {preview.description ? (
            <p className="text-xs text-muted-foreground">{preview.description}</p>
          ) : null}
        </div>
        <Button
          type="submit"
          size="sm"
          variant={
            preview.tone === "destructive"
              ? "destructive"
              : needsApproval
                ? "secondary"
                : "default"
          }
          disabled={disabled}
        >
          {needsApproval ? "Request approval" : preview.label}
        </Button>
      </div>

      {preview.offered ? (
        <div className="space-y-2">
          {preview.inputFields.map((field) => (
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
                  name={`input:string:${field.name}`}
                  rows={2}
                  className="text-xs"
                />
              ) : field.type === "enum" ? (
                <select
                  id={`${preview.action}-${field.name}`}
                  name={`input:string:${field.name}`}
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  id={`${preview.action}-${field.name}`}
                  name={`input:boolean:${field.name}`}
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <Input
                  id={`${preview.action}-${field.name}`}
                  name={`input:${field.type === "number" ? "number" : "string"}:${field.name}`}
                  type={field.type === "number" ? "number" : "text"}
                  className="h-8 text-xs"
                />
              )}
            </div>
          ))}

          {preview.decision ? (
            <div className="space-y-1">
              <PolicyOutcomeLine decision={preview.decision} />
              <button
                type="button"
                onClick={() => setShowTrace((v) => !v)}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                {showTrace ? "Hide" : "Show"} policy trace ({preview.decision.trace.length})
              </button>
              {showTrace ? <PolicyTraceList trace={preview.decision.trace} /> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{preview.unavailableReason}</p>
      )}
    </form>
  );
}
