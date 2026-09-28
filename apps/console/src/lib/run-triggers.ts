import type { Actor } from "@console/engine/types";
import { loadConstants } from "@console/engine/policy/constants";
import { ROLE_META } from "@console/permissions";
import {
  CHARGEBACKS_FROM_POWER_APPS,
  COMPANIES_HOUSE_CHECK,
  IMPLEMENTATION_KINDS,
  listRuns,
  roleMayStart,
  TWO_PERSON_APPROVAL,
  type RunKind,
  type RunnableSpec,
} from "@console/tool-automation";
import { listExport } from "@console/tool-automation/context";
import { ADMIN_APPROVAL_USD_KEY } from "@console/tool-refunds";
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

const ADDITION: RunKind = "IMPLEMENTATION/ADDITION";

/**
 * Whether the spec's change is already in the code: its newest merged run is
 * an addition, not an undo. A built feature doesn't offer itself again.
 */
function isLive(spec: RunnableSpec): boolean {
  const merged = listRuns({ limit: 200 }).find(
    (run) => run.spec === spec.file && run.status === "merged",
  );
  return merged !== undefined && IMPLEMENTATION_KINDS.includes(merged.kind as RunKind);
}

function trigger(
  spec: RunnableSpec,
  actor: Actor,
  evidence: { evidenceKey: string; evidenceIds: readonly string[] },
): Trigger | null {
  if (isLive(spec)) return null;
  if (!roleMayStart(actor.role, spec, ADDITION)) {
    const meta = ROLE_META[actor.role];
    // Only the people one step away from asking see the button, greyed out.
    const nearly = meta.level === "manager" && (spec.domain === null || meta.domain === spec.domain);
    return nearly
      ? { label: spec.title, offer: null, blocked: "Only an admin can ask for this" }
      : null;
  }
  const offer = buildHandoffOffer(spec, ADDITION, actor, evidence, bridgeDeps());
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
  if (tool === TWO_PERSON_APPROVAL.evidence.tool && record.status === "requested") {
    const adminLine = loadConstants().number(ADMIN_APPROVAL_USD_KEY, Number.POSITIVE_INFINITY);
    if (Number(record.usdMinor) >= adminLine) {
      out.push(trigger(TWO_PERSON_APPROVAL, actor, { evidenceKey: id, evidenceIds: [id] }));
    }
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
