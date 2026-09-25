import type { Role } from "@console/engine/types";
import { getTool } from "@/registry";
import { ALL_ROLES, MANAGER_ROLES, rolesFor } from "@console/permissions";

export const MODE_AREAS = ["Compliance", "Money movement", "Customers", "Platform"] as const;
export type ModeArea = (typeof MODE_AREAS)[number];

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
  area: ModeArea;
  /** Column headings for the sample queue on a pending mode's preview page. */
  columns?: string[];
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
    roles: rolesFor("kyc", "agent"),
    actions: ["approve", "reject", "request_info"],
    segment: "both",
    area: "Compliance",
  },
  {
    id: "refunds",
    name: "Refunds",
    description: "Refund requests against captured payments.",
    icon: "Undo2",
    roles: rolesFor("refunds", "agent"),
    actions: ["request_refund", "approve", "reject", "execute"],
    segment: "both",
    area: "Money movement",
  },
  {
    id: "flags",
    name: "Feature flags",
    description: "Runtime configuration and kill switches by environment.",
    icon: "ToggleLeft",
    roles: MANAGER_ROLES,
    actions: ["enable", "disable"],
    segment: "platform",
    area: "Platform",
  },
  {
    id: "aml_alerts",
    name: "Transaction monitoring",
    description: "AML rule and model alerts triaged into escalations.",
    icon: "Radar",
    roles: rolesFor("kyc", "agent"),
    actions: ["triage", "escalate", "close"],
    segment: "both",
    area: "Compliance",
    columns: ["Alert", "Customer", "Rule", "Amount", "Score"],
  },
  {
    id: "sanctions",
    name: "Sanctions screening",
    description: "Name-screening hits requiring true/false positive calls.",
    icon: "ShieldAlert",
    roles: rolesFor("kyc", "agent"),
    actions: ["clear", "confirm_match", "freeze_account"],
    segment: "both",
    area: "Compliance",
    columns: ["Hit", "Name", "List", "Match", "Status"],
  },
  {
    id: "sar_filing",
    name: "SAR / STR filing",
    description: "Suspicious activity reports from draft to filed.",
    icon: "FileWarning",
    roles: rolesFor("kyc", "manager"),
    actions: ["draft", "review", "file"],
    segment: "both",
    area: "Compliance",
    columns: ["Report", "Subject", "Typology", "Amount", "Due"],
  },
  {
    id: "wire_release",
    name: "Wire release queue",
    description: "High-value outbound payments held for dual control.",
    icon: "Banknote",
    roles: rolesFor("refunds", "agent"),
    actions: ["release", "hold", "cancel"],
    segment: "business",
    area: "Money movement",
    columns: ["Wire", "Beneficiary", "Country", "Amount", "Held"],
  },
  {
    id: "chargebacks",
    name: "Chargebacks & disputes",
    description: "Disputes, evidence packs and representment deadlines.",
    icon: "Gavel",
    roles: rolesFor("refunds", "agent"),
    actions: ["accept", "represent", "submit_evidence"],
    segment: "both",
    area: "Money movement",
    columns: ["Dispute", "Merchant", "Reason", "Amount", "Deadline"],
  },
  {
    id: "remittances",
    name: "Remittances",
    description: "Cross-border payouts, corridor limits and repairs.",
    icon: "Globe2",
    roles: rolesFor("refunds", "agent"),
    actions: ["repair", "retry", "refund_sender"],
    segment: "consumer",
    area: "Money movement",
    columns: ["Transfer", "Corridor", "Sender", "Amount", "Status"],
  },
  {
    id: "ledger_adjustments",
    name: "Ledger adjustments",
    description: "Manual credits, write-offs and goodwill postings.",
    icon: "BookOpenCheck",
    roles: rolesFor("refunds", "manager"),
    actions: ["post_credit", "write_off"],
    segment: "both",
    area: "Money movement",
    columns: ["Posting", "Account", "Type", "Amount", "Requested"],
  },
  {
    id: "card_ops",
    name: "Card operations",
    description: "Reissue, freeze and spend controls on issued cards.",
    icon: "CreditCard",
    roles: ALL_ROLES,
    actions: ["freeze", "unfreeze", "reissue", "set_limit"],
    segment: "consumer",
    area: "Customers",
    columns: ["Card", "Customer", "Product", "Limit", "Status"],
  },
  {
    id: "account_closure",
    name: "Offboarding",
    description: "Account closure, exit reasons and balance return.",
    icon: "DoorOpen",
    roles: MANAGER_ROLES,
    actions: ["initiate_closure", "approve_closure"],
    segment: "both",
    area: "Customers",
    columns: ["Account", "Customer", "Reason", "Balance", "Requested"],
  },
  {
    id: "complaints",
    name: "Complaints",
    description: "Regulated complaint handling with response clocks.",
    icon: "MessageSquareWarning",
    roles: ALL_ROLES,
    actions: ["acknowledge", "resolve", "escalate"],
    segment: "both",
    area: "Customers",
    columns: ["Complaint", "Customer", "Category", "Received", "Clock"],
  },
  {
    id: "dsar",
    name: "Data subject requests",
    description: "GDPR access, rectification and erasure requests.",
    icon: "FileLock2",
    roles: MANAGER_ROLES,
    actions: ["fulfil", "reject"],
    segment: "consumer",
    area: "Customers",
    columns: ["Request", "Subject", "Type", "Received", "Due"],
  },
  {
    id: "merchant_onboarding",
    name: "Business onboarding",
    description: "KYB for business clients: UBOs, documents, risk tier.",
    icon: "Building2",
    roles: rolesFor("kyc", "agent"),
    actions: ["approve", "reject", "request_info"],
    segment: "business",
    area: "Compliance",
    columns: ["Business", "Country", "Owners", "Risk tier", "Status"],
  },
  {
    id: "pricing",
    name: "Pricing & rates",
    description: "FX spreads, APY and fee schedule changes.",
    icon: "Percent",
    roles: MANAGER_ROLES,
    actions: ["propose", "publish"],
    segment: "both",
    area: "Platform",
    columns: ["Change", "Product", "Current", "Proposed", "Effective"],
  },
  {
    id: "plans",
    name: "Plans & entitlements",
    description: "Paid tiers, entitlements and bespoke overrides.",
    icon: "Layers",
    roles: MANAGER_ROLES,
    actions: ["grant", "revoke"],
    segment: "both",
    area: "Customers",
    columns: ["Customer", "Plan", "Entitlement", "Override", "Expires"],
  },
  {
    id: "model_risk",
    name: "Model overrides",
    description: "Risk model versions, thresholds and manual overrides.",
    icon: "Brain",
    roles: ["admin"],
    actions: ["promote_model", "override_score"],
    segment: "platform",
    area: "Platform",
    columns: ["Model", "Version", "Metric", "Threshold", "Status"],
  },
  {
    id: "reconciliation",
    name: "Reconciliation breaks",
    description: "Unmatched ledger and scheme settlement entries.",
    icon: "Scale",
    roles: rolesFor("refunds", "agent"),
    actions: ["match", "write_off", "escalate"],
    segment: "platform",
    area: "Money movement",
    columns: ["Break", "Source", "Counterparty", "Amount", "Age"],
  },
  {
    id: "collections",
    name: "Collections",
    description: "Arrears, forbearance plans and recovery actions.",
    icon: "HandCoins",
    roles: ALL_ROLES,
    actions: ["plan", "pause", "escalate"],
    segment: "consumer",
    area: "Customers",
    columns: ["Account", "Customer", "Arrears", "Days late", "Plan"],
  },
];

/** Modes backed by a registered tool that this role may see. */
export function liveModes(actorRole: Role): OpsMode[] {
  return OPS_MODES.filter((mode) => {
    const decl = getTool(mode.id);
    return decl !== undefined && decl.visibleTo.includes(actorRole);
  });
}

export interface ModeEntry extends OpsMode {
  live: boolean;
  href: string;
}

/**
 * Every mode this role may open, with the tool's own declaration taking over
 * where one is registered. A registered tool this role cannot see has no page
 * at all; roadmap only exists for unregistered modes, so the entry is omitted.
 */
export function modesFor(actorRole: Role): ModeEntry[] {
  return OPS_MODES.flatMap((mode) => {
    const decl = getTool(mode.id);
    if (decl !== undefined && !decl.visibleTo.includes(actorRole)) return [];
    const live = decl !== undefined;
    return [{
      ...mode,
      name: decl?.displayName ?? mode.name,
      description: decl?.description ?? mode.description,
      icon: decl?.icon ?? mode.icon,
      actions: decl ? decl.actions.map((a) => a.name) : mode.actions,
      live,
      href: live ? `/t/${mode.id}` : `/roadmap/${mode.id}`,
    }];
  });
}
