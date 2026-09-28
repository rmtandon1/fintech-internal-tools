import type { Actor } from "@console/engine/types";
import { ROLE_META } from "@console/permissions";
import {
  CHARGEBACKS_FROM_POWER_APPS,
  COMPANIES_HOUSE_CHECK,
  listRuns,
  roleMayStart,
  type RunnableSpec,
} from "@console/tool-automation";
import { listExport } from "@console/tool-automation/context";
import { bridgeDeps } from "@/lib/bridge";
import { buildHandoffOffer, type HandoffOffer } from "@/lib/handoff";

/**
 * An "Ask Devin" button on the screen that shows why the change is needed.
 * `offer` is set when this role may send it; otherwise `blocked` says who
 * can, so the role model shows on screen instead of being described.
 */
export interface Trigger {
  label: string;
  offer: HandoffOffer | null;
  blocked: string | null;
}

const CHANGE = "change";

/**
 * Whether the spec's change is already in the code: its newest merged run is
 * a change, not an undo. A built feature doesn't offer itself again.
 */
function isLive(spec: RunnableSpec): boolean {
  const merged = listRuns({ limit: 200 }).find(
    (run) => run.spec === spec.file && run.status === "merged",
  );
  return merged !== undefined && merged.operation === "change";
}

function trigger(
  spec: RunnableSpec,
  actor: Actor,
  evidence: { evidenceKey: string; evidenceIds: readonly string[] },
): Trigger | null {
  if (isLive(spec)) return null;
  if (!roleMayStart(actor.role, spec, CHANGE)) {
    const meta = ROLE_META[actor.role];
    // Only the people one step away from asking see the button, greyed out.
    const nearly = meta.level === "manager" && (spec.domain === null || meta.domain === spec.domain);
    return nearly
      ? { label: spec.title, offer: null, blocked: "Only an admin can ask for this" }
      : null;
  }
  const offer = buildHandoffOffer(spec, CHANGE, actor, evidence, bridgeDeps());
  return offer ? { label: spec.title, offer, blocked: null } : null;
}

/** The buttons a record page shows for `record` of `tool`. */
export function recordTriggers(
  tool: string,
  record: Record<string, unknown>,
  actor: Actor,
): Trigger[] {
  const id = String(record.id);
  const out: (Trigger | null)[] = [];
  if (
    tool === COMPANIES_HOUSE_CHECK.evidence.tool &&
    record.segment === "business" &&
    record.country === "GB" &&
    record.documentType === "company_registry"
  ) {
    out.push(trigger(COMPANIES_HOUSE_CHECK, actor, { evidenceKey: id, evidenceIds: [id] }));
  }
  return out.filter((t): t is Trigger => t !== null);
}

/** The buttons a Coming soon page shows for app `modeId`: only when its export is committed. */
export function modeTriggers(modeId: string, actor: Actor): Trigger[] {
  if (modeId !== CHARGEBACKS_FROM_POWER_APPS.tool) return [];
  const files = listExport(bridgeDeps().repoRoot, modeId);
  if (files.length === 0) return [];
  const t = trigger(CHARGEBACKS_FROM_POWER_APPS, actor, { evidenceKey: modeId, evidenceIds: files });
  return t ? [t] : [];
}
