"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ulid } from "ulid";
import { submitIntent, type SubmitResult } from "@/app/actions";
import { ActionResult } from "@/components/action-result";
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
import { Textarea } from "@console/ui/textarea";
import type { ActionPreview } from "@console/engine/policy/preview";
import type { StatusDecl } from "@console/engine/types";
import { humanize } from "@console/ui/format";

interface Note {
  action: string;
  tone: "approval" | "deny";
  text: string;
}

/** The last completed submission per action, so the same payload sent again replays it. */
type Completed = Record<string, { key: string; payload: string }>;

/**
 * The actions this person can take on the record right now. Actions their
 * role or the record's status rules out are left off entirely; one that needs
 * approval or is blocked says so in a line under the buttons.
 *
 * The dialog lives here rather than on each button: a successful action
 * usually changes the record's status, which removes its own button, and the
 * result must stay on screen until it is closed.
 */
export function ActionBar({
  tool,
  recordId,
  recordLabel,
  previews,
  statuses,
  ruleLabels,
}: {
  tool: string;
  recordId: string | null;
  /** How the record is named in dialog titles, e.g. its id. */
  recordLabel?: string;
  previews: ActionPreview[];
  statuses: StatusDecl[];
  ruleLabels?: Record<string, string>;
}) {
  // The preview is copied when the dialog opens, so a refresh that drops the
  // action from `previews` leaves the open dialog untouched.
  const [active, setActive] = useState<{ preview: ActionPreview; autoSubmit: boolean } | null>(
    null,
  );
  const completed = useRef<Completed>({});
  const offered = previews.filter((p) => p.offered);

  const notes = offered.flatMap((preview): Note[] => {
    const decision = preview.decision;
    if (decision?.effect === "require_approval") {
      return [
        {
          action: preview.action,
          tone: "approval",
          text: `${preview.label} needs ${decision.tier ?? "manager"} approval: ${decision.reason ?? ""}`,
        },
      ];
    }
    if (decision?.effect === "deny") {
      return [
        {
          action: preview.action,
          tone: "deny",
          text: `${preview.label} is blocked: ${decision.reason ?? ""}`,
        },
      ];
    }
    return [];
  });

  return (
    <div className="flex w-full flex-col gap-2">
      {offered.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">Nothing to do here right now.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {offered.map((preview) => {
            const { label, variant, disabled, title } = buttonFor(preview);
            return (
              <Button
                key={preview.action}
                variant={variant}
                disabled={disabled}
                title={title}
                onClick={() =>
                  setActive({ preview, autoSubmit: preview.inputFields.length === 0 })
                }
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}
      {notes.length > 0 ? (
        <ul className="space-y-0.5 text-[13px]">
          {notes.map((note) => (
            <li
              key={note.action}
              className={note.tone === "approval" ? "text-amber-400" : "text-red-400"}
            >
              {note.text}
            </li>
          ))}
        </ul>
      ) : null}
      {active ? (
        <ActionDialog
          key={active.preview.action}
          tool={tool}
          recordId={recordId}
          recordLabel={recordLabel ?? recordId}
          preview={active.preview}
          autoSubmit={active.autoSubmit}
          statuses={statuses}
          ruleLabels={ruleLabels}
          completed={completed.current}
          onClose={() => setActive(null)}
        />
      ) : null}
    </div>
  );
}

function buttonFor(preview: ActionPreview) {
  const denied = preview.decision?.effect === "deny";
  const needsApproval = preview.decision?.effect === "require_approval";
  const tier = preview.decision?.tier ?? "manager";
  return {
    label: needsApproval ? `Send to ${tier}` : preview.label,
    variant:
      preview.tone === "destructive"
        ? ("destructive" as const)
        : needsApproval
          ? ("secondary" as const)
          : ("default" as const),
    disabled: denied,
    title: needsApproval ? `${preview.label} needs ${tier} approval` : undefined,
  };
}

/** The submitted input fields, in a stable order, as the engine will hash them. */
function payloadOf(form: FormData): string {
  const entries = Array.from(form.entries())
    .filter(([key]) => key.startsWith("input:"))
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function ActionDialog({
  tool,
  recordId,
  recordLabel,
  preview,
  autoSubmit,
  statuses,
  ruleLabels,
  completed,
  onClose,
}: {
  tool: string;
  recordId: string | null;
  recordLabel: string | null;
  preview: ActionPreview;
  /** Actions with no inputs are sent as soon as the button is clicked. */
  autoSubmit: boolean;
  statuses: StatusDecl[];
  ruleLabels?: Record<string, string>;
  completed: Completed;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<"form" | "result">(autoSubmit ? "result" : "form");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => ulid());
  const [submittedKey, setSubmittedKey] = useState(idempotencyKey);
  const sent = useRef(false);

  const { label: buttonLabel, variant, disabled } = buttonFor(preview);
  const needsApproval = preview.decision?.effect === "require_approval";
  const tier = preview.decision?.tier ?? "manager";
  const title = recordLabel ? `${preview.label}: ${recordLabel}` : preview.label;

  function submit(form: FormData) {
    form.set("tool", tool);
    form.set("action", preview.action);
    if (recordId) form.set("recordId", recordId);
    const payload = payloadOf(form);
    const prior = completed[preview.action];
    const key = prior?.payload === payload ? prior.key : idempotencyKey;
    form.set("idempotencyKey", key);
    setSubmittedKey(key);
    setResult(null);
    setStage("result");
    startTransition(async () => {
      const next = await submitIntent(form);
      setResult(next);
      const status = next.outcome.status;
      if (status === "applied" || status === "pending_approval") {
        completed[preview.action] = { key, payload };
      }
      setIdempotencyKey(ulid());
    });
  }

  useEffect(() => {
    if (!autoSubmit || sent.current) return;
    sent.current = true;
    submit(new FormData());
    // Sent once, when the dialog opens for an action with no inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A denial or error keeps the entered values so they can be fixed and sent again.
  const canRetry =
    !autoSubmit &&
    result !== null &&
    (result.outcome.status === "denied" || result.outcome.status === "error");

  return (
    <Dialog open onOpenChange={(open) => (!open && !pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {stage === "form" && preview.description ? (
            <DialogDescription>{preview.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form action={submit} className={stage === "form" ? "space-y-4" : "hidden"}>
          {preview.inputFields.map((field) => (
            // `input:<type><?>:<name>`: the marker tells the server a blank
            // value means "not supplied" rather than an empty value.
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={`${preview.action}-${field.name}`} className="text-sm">
                {humanize(field.name)}
                {field.optional ? (
                  <span className="font-normal text-muted-foreground"> (optional)</span>
                ) : null}
              </Label>
              {field.type === "string" &&
              (field.name.includes("reason") || field.name === "note") ? (
                <Textarea
                  id={`${preview.action}-${field.name}`}
                  name={`input:string${field.optional ? "?" : ""}:${field.name}`}
                  rows={3}
                />
              ) : field.type === "enum" ? (
                <select
                  id={`${preview.action}-${field.name}`}
                  name={`input:string${field.optional ? "?" : ""}:${field.name}`}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {field.optional ? <option value="">—</option> : null}
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {humanize(option)}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  id={`${preview.action}-${field.name}`}
                  name={`input:boolean${field.optional ? "?" : ""}:${field.name}`}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
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
                />
              )}
            </div>
          ))}
          {needsApproval ? (
            <p className="text-sm text-amber-400">
              This goes to a{tier === "admin" ? "n" : ""} {tier} for approval:{" "}
              {preview.decision?.reason}.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={variant} disabled={disabled || pending}>
              {buttonLabel}
            </Button>
          </div>
        </form>
        {stage === "result" ? (
          <>
            <ActionResult
              result={result}
              actionLabel={preview.label}
              recordId={recordId}
              idempotencyKey={submittedKey}
              statuses={statuses}
              ruleLabels={ruleLabels}
            />
            <div className="flex justify-end gap-2">
              {canRetry ? (
                <Button variant="ghost" onClick={() => setStage("form")}>
                  Back
                </Button>
              ) : null}
              <Button variant="outline" disabled={pending} onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
