import type { Role } from "@/engine/types";
import { getTool } from "@/tools";

export interface OpsMode {
  /** Matches a registered tool's `name` where one is registered. */
  id: string;
  name: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  roles: Role[];
  actions: string[];
  segment: "consumer" | "business" | "both" | "platform";
}

/**
 * The console's full surface. A mode whose `id` matches a registered tool is
 * navigable and renders that tool's own declaration.
 */
export const OPS_MODES: OpsMode[] = [
  {
    id: "kyc",
    name: "KYC review queue",
    description: "Customer due diligence cases awaiting a decision.",
    icon: "IdCard",
    roles: ["analyst", "manager", "admin"],
    actions: ["approve", "reject", "request_info"],
    segment: "both",
  },
  {
    id: "refunds",
    name: "Refunds",
    description: "Refund requests against captured payments.",
    icon: "Undo2",
    roles: ["analyst", "manager", "admin"],
    actions: ["request_refund", "approve", "reject", "execute"],
    segment: "both",
  },
  {
    id: "flags",
    name: "Feature flags",
    description: "Runtime configuration and kill switches by environment.",
    icon: "ToggleLeft",
    roles: ["analyst", "manager", "admin"],
    actions: ["enable", "disable"],
    segment: "platform",
  },
  {
    id: "aml_alerts",
    name: "Transaction monitoring",
    description: "AML rule and model alerts triaged into escalations.",
    icon: "Radar",
    roles: ["analyst", "manager", "admin"],
    actions: ["triage", "escalate", "close"],
    segment: "both",
  },
  {
    id: "sanctions",
    name: "Sanctions screening",
    description: "Name-screening hits requiring true/false positive calls.",
    icon: "ShieldAlert",
    roles: ["analyst", "manager", "admin"],
    actions: ["clear", "confirm_match", "freeze_account"],
    segment: "both",
  },
  {
    id: "sar_filing",
    name: "SAR / STR filing",
    description: "Suspicious activity reports from draft to filed.",
    icon: "FileWarning",
    roles: ["manager", "admin"],
    actions: ["draft", "review", "file"],
    segment: "both",
  },
  {
    id: "wire_release",
    name: "Wire release queue",
    description: "High-value outbound payments held for dual control.",
    icon: "Banknote",
    roles: ["analyst", "manager", "admin"],
    actions: ["release", "hold", "cancel"],
    segment: "business",
  },
  {
    id: "chargebacks",
    name: "Chargebacks & disputes",
    description: "Disputes, evidence packs and representment deadlines.",
    icon: "Gavel",
    roles: ["analyst", "manager", "admin"],
    actions: ["accept", "represent", "submit_evidence"],
    segment: "both",
  },
  {
    id: "remittances",
    name: "Remittances",
    description: "Cross-border payouts, corridor limits and repairs.",
    icon: "Globe2",
    roles: ["analyst", "manager", "admin"],
    actions: ["repair", "retry", "refund_sender"],
    segment: "consumer",
  },
  {
    id: "ledger_adjustments",
    name: "Ledger adjustments",
    description: "Manual credits, write-offs and goodwill postings.",
    icon: "BookOpenCheck",
    roles: ["manager", "admin"],
    actions: ["post_credit", "write_off"],
    segment: "both",
  },
  {
    id: "card_ops",
    name: "Card operations",
    description: "Reissue, freeze and spend controls on issued cards.",
    icon: "CreditCard",
    roles: ["analyst", "manager", "admin"],
    actions: ["freeze", "unfreeze", "reissue", "set_limit"],
    segment: "consumer",
  },
  {
    id: "account_closure",
    name: "Offboarding",
    description: "Account closure, exit reasons and balance return.",
    icon: "DoorOpen",
    roles: ["manager", "admin"],
    actions: ["initiate_closure", "approve_closure"],
    segment: "both",
  },
  {
    id: "complaints",
    name: "Complaints",
    description: "Regulated complaint handling with response clocks.",
    icon: "MessageSquareWarning",
    roles: ["analyst", "manager", "admin"],
    actions: ["acknowledge", "resolve", "escalate"],
    segment: "both",
  },
  {
    id: "dsar",
    name: "Data subject requests",
    description: "GDPR access, rectification and erasure requests.",
    icon: "FileLock2",
    roles: ["manager", "admin"],
    actions: ["fulfil", "reject"],
    segment: "consumer",
  },
  {
    id: "merchant_onboarding",
    name: "Business onboarding",
    description: "KYB for business clients: UBOs, documents, risk tier.",
    icon: "Building2",
    roles: ["analyst", "manager", "admin"],
    actions: ["approve", "reject", "request_info"],
    segment: "business",
  },
  {
    id: "pricing",
    name: "Pricing & rates",
    description: "FX spreads, APY and fee schedule changes.",
    icon: "Percent",
    roles: ["manager", "admin"],
    actions: ["propose", "publish"],
    segment: "both",
  },
  {
    id: "plans",
    name: "Plans & entitlements",
    description: "Paid tiers, entitlements and bespoke overrides.",
    icon: "Layers",
    roles: ["manager", "admin"],
    actions: ["grant", "revoke"],
    segment: "both",
  },
  {
    id: "model_risk",
    name: "Model overrides",
    description: "Risk model versions, thresholds and manual overrides.",
    icon: "Brain",
    roles: ["admin"],
    actions: ["promote_model", "override_score"],
    segment: "platform",
  },
  {
    id: "reconciliation",
    name: "Reconciliation breaks",
    description: "Unmatched ledger and scheme settlement entries.",
    icon: "Scale",
    roles: ["analyst", "manager", "admin"],
    actions: ["match", "write_off", "escalate"],
    segment: "platform",
  },
  {
    id: "collections",
    name: "Collections",
    description: "Arrears, forbearance plans and recovery actions.",
    icon: "HandCoins",
    roles: ["analyst", "manager", "admin"],
    actions: ["plan", "pause", "escalate"],
    segment: "consumer",
  },
];

/** Modes backed by a registered tool that this role may see. */
export function liveModes(actorRole: Role): OpsMode[] {
  return OPS_MODES.filter((mode) => {
    const decl = getTool(mode.id);
    return decl !== undefined && decl.visibleTo.includes(actorRole);
  });
}
