import { z } from "zod";
import { getSpec, RUN_KINDS, RUN_SCOPES } from "@console/tool-automation";

const DispatchForm = z.object({
  spec: z.string().min(1),
  kind: z.enum(RUN_KINDS),
  scope: z.enum(RUN_SCOPES),
  intent: z.string().min(1).max(500),
  /** Optional on a REVERSAL: derived from the reversed run's context.json. */
  clusterKey: z.string().min(1).optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
  reverses: z.string().min(1).optional(),
});

export type DispatchFormData = z.infer<typeof DispatchForm>;

/**
 * Validate the dispatch form before any actor lookup or bridge call. A
 * REVERSAL carries no free intent: it must use the spec's reversal sentence
 * verbatim, so a tampered form cannot smuggle instructions into an undo.
 */
export function parseDispatchForm(
  form: FormData,
): { ok: true; data: DispatchFormData } | { ok: false; detail: string } {
  const parsed = DispatchForm.safeParse({
    spec: form.get("spec"),
    kind: form.get("kind"),
    scope: form.get("scope"),
    intent: form.get("intent"),
    clusterKey: form.get("clusterKey") ?? undefined,
    evidenceIds: form.getAll("evidenceIds").map(String),
    reverses: form.get("reverses") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, detail: parsed.error.issues[0]?.message ?? "invalid form" };
  }
  const data = parsed.data;
  if (data.kind === "REVERSAL" ? !data.reverses : !data.clusterKey || data.evidenceIds.length === 0) {
    return {
      ok: false,
      detail:
        data.kind === "REVERSAL"
          ? "A REVERSAL must name the run it reverses"
          : "A run needs a cluster key and evidence ids",
    };
  }
  if (data.kind === "REVERSAL" && data.intent !== getSpec(data.spec)?.intents.REVERSAL) {
    return { ok: false, detail: "A reversal uses the spec's reversal intent" };
  }
  return { ok: true, data };
}
