import type { Role } from "@/engine/types";

export interface OpsMode {
  /** Matches a registered tool's `name` when `status` is "live". */
  id: string;
  name: string;
  group: ModeGroup;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  roles: Role[];
  actions: string[];
  segment: "consumer" | "business" | "both" | "platform";
}

export const MODE_GROUPS = [
  "Risk & Compliance",
  "Money Movement",
  "Customer Ops",
  "Platform & Config",
] as const;

export type ModeGroup = (typeof MODE_GROUPS)[number];

/**
 * The console's full surface. A mode whose `id` matches a registered tool is
 * navigable; the rest are declared but not yet built.
 */
export const OPS_MODES: OpsMode[] = [
  {
    id: "kyc",
    name: "KYC review queue",
    group: "Risk & Compliance",
    description: "Customer due diligence cases awaiting a decision.",
    icon: "IdCard",
    roles: ["analyst", "manager", "admin"],
    actions: ["approve", "reject", "request_info"],
    segment: "both",
  },
  {
    id: "refunds",
    name: "Refunds",
    group: "Money Movement",
    description: "Refund requests against captured payments.",
    icon: "Undo2",
    roles: ["analyst", "manager", "admin"],
    actions: ["request_refund", "approve", "reject", "execute"],
    segment: "both",
  },
  {
    id: "flags",
    name: "Feature flags",
    group: "Platform & Config",
    description: "Runtime configuration and kill switches by environment.",
    icon: "ToggleLeft",
    roles: ["analyst", "manager", "admin"],
    actions: ["enable", "disable"],
    segment: "platform",
  },
  {
    id: "aml_alerts",
    name: "Transaction monitoring",
    group: "Risk & Compliance",
    description: "AML rule and model alerts triaged into escalations.",
    icon: "Radar",
    roles: ["analyst", "manager", "admin"],
    actions: ["triage", "escalate", "close"],
    segment: "both",
  },
  {
    id: "sanctions",
    name: "Sanctions screening",
    group: "Risk & Compliance",
    description: "Name-screening hits requiring true/false positive calls.",
    icon: "ShieldAlert",
    roles: ["analyst", "manager", "admin"],
    actions: ["clear", "confirm_match", "freeze_account"],
    segment: "both",
  },
  {
    id: "sar_filing",
    name: "SAR / STR filing",
    group: "Risk & Compliance",
    description: "Suspicious activity reports from draft to filed.",
    icon: "FileWarning",
    roles: ["manager", "admin"],
    actions: ["draft", "review", "file"],
    segment: "both",
  },
  {
    id: "wire_release",
    name: "Wire release queue",
    group: "Money Movement",
    description: "High-value outbound payments held for dual control.",
    icon: "Banknote",
    roles: ["analyst", "manager", "admin"],
    actions: ["release", "hold", "cancel"],
    segment: "business",
  },
  {
    id: "chargebacks",
    name: "Chargebacks & disputes",
    group: "Money Movement",
    description: "Disputes, evidence packs and representment deadlines.",
    icon: "Gavel",
    roles: ["analyst", "manager", "admin"],
    actions: ["accept", "represent", "submit_evidence"],
    segment: "both",
  },
  {
    id: "remittances",
    name: "Remittances",
    group: "Money Movement",
    description: "Cross-border payouts, corridor limits and repairs.",
    icon: "Globe2",
    roles: ["analyst", "manager", "admin"],
    actions: ["repair", "retry", "refund_sender"],
    segment: "consumer",
  },
  {
    id: "ledger_adjustments",
    name: "Ledger adjustments",
    group: "Money Movement",
    description: "Manual credits, write-offs and goodwill postings.",
    icon: "BookOpenCheck",
    roles: ["manager", "admin"],
    actions: ["post_credit", "write_off"],
    segment: "both",
  },
  {
    id: "card_ops",
    name: "Card operations",
    group: "Customer Ops",
    description: "Reissue, freeze and spend controls on issued cards.",
    icon: "CreditCard",
    roles: ["analyst", "manager", "admin"],
    actions: ["freeze", "unfreeze", "reissue", "set_limit"],
    segment: "consumer",
  },
  {
    id: "account_closure",
    name: "Offboarding",
    group: "Customer Ops",
    description: "Account closure, exit reasons and balance return.",
    icon: "DoorOpen",
    roles: ["manager", "admin"],
    actions: ["initiate_closure", "approve_closure"],
    segment: "both",
  },
  {
    id: "complaints",
    name: "Complaints",
    group: "Customer Ops",
    description: "Regulated complaint handling with response clocks.",
    icon: "MessageSquareWarning",
    roles: ["analyst", "manager", "admin"],
    actions: ["acknowledge", "resolve", "escalate"],
    segment: "both",
  },
  {
    id: "dsar",
    name: "Data subject requests",
    group: "Customer Ops",
    description: "GDPR access, rectification and erasure requests.",
    icon: "FileLock2",
    roles: ["manager", "admin"],
    actions: ["fulfil", "reject"],
    segment: "consumer",
  },
  {
    id: "merchant_onboarding",
    name: "Business onboarding",
    group: "Risk & Compliance",
    description: "KYB for business clients: UBOs, documents, risk tier.",
    icon: "Building2",
    roles: ["analyst", "manager", "admin"],
    actions: ["approve", "reject", "request_info"],
    segment: "business",
  },
  {
    id: "pricing",
    name: "Pricing & rates",
    group: "Platform & Config",
    description: "FX spreads, APY and fee schedule changes.",
    icon: "Percent",
    roles: ["manager", "admin"],
    actions: ["propose", "publish"],
    segment: "both",
  },
  {
    id: "plans",
    name: "Plans & entitlements",
    group: "Platform & Config",
    description: "Paid tiers, entitlements and bespoke overrides.",
    icon: "Layers",
    roles: ["manager", "admin"],
    actions: ["grant", "revoke"],
    segment: "both",
  },
  {
    id: "model_risk",
    name: "Model overrides",
    group: "Platform & Config",
    description: "Risk model versions, thresholds and manual overrides.",
    icon: "Brain",
    roles: ["admin"],
    actions: ["promote_model", "override_score"],
    segment: "platform",
  },
  {
    id: "reconciliation",
    name: "Reconciliation breaks",
    group: "Money Movement",
    description: "Unmatched ledger and scheme settlement entries.",
    icon: "Scale",
    roles: ["analyst", "manager", "admin"],
    actions: ["match", "write_off", "escalate"],
    segment: "platform",
  },
  {
    id: "collections",
    name: "Collections",
    group: "Customer Ops",
    description: "Arrears, forbearance plans and recovery actions.",
    icon: "HandCoins",
    roles: ["analyst", "manager", "admin"],
    actions: ["plan", "pause", "escalate"],
    segment: "consumer",
  },
];

export function modesByGroup(): { group: ModeGroup; modes: OpsMode[] }[] {
  return MODE_GROUPS.map((group) => ({
    group,
    modes: OPS_MODES.filter((m) => m.group === group),
  }));
}
