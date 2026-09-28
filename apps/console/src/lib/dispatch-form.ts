import { z } from "zod";
import { getSpec, OPERATIONS } from "@console/tool-automation";

const DispatchForm = z.object({
  spec: z.string().min(1),
  operation: z.enum(OPERATIONS),
  intent: z.string().min(1).max(500),
  /** The record the request starts from. Optional on an undo: read from the undone run. */
  evidenceKey: z.string().min(1).optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
  reverses: z.string().min(1).optional(),
});

export type DispatchFormData = z.infer<typeof DispatchForm>;

/**
 * Validate the dispatch form before any actor lookup or bridge call. An
 * undo carries no free intent: it must use the spec's undo sentence
 * verbatim, so a tampered form cannot smuggle instructions into an undo.
 */
export function parseDispatchForm(
  form: FormData,
): { ok: true; data: DispatchFormData } | { ok: false; detail: string } {
  const parsed = DispatchForm.safeParse({
    spec: form.get("spec"),
    operation: form.get("operation"),
    intent: form.get("intent"),
    evidenceKey: form.get("evidenceKey") ?? undefined,
    evidenceIds: form.getAll("evidenceIds").map(String),
    reverses: form.get("reverses") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, detail: parsed.error.issues[0]?.message ?? "invalid form" };
  }
  const data = parsed.data;
  if (data.operation === "undo" ? !data.reverses : !data.evidenceKey || data.evidenceIds.length === 0) {
    return {
      ok: false,
      detail:
        data.operation === "undo"
          ? "An undo must name the run it undoes"
          : "A run needs the record it starts from and its evidence ids",
    };
  }
  if (data.operation === "undo" && data.intent !== getSpec(data.spec)?.intents.undo) {
    return { ok: false, detail: "An undo uses the spec's undo intent" };
  }
  return { ok: true, data };
}
