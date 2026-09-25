/**
 * The single role catalog. Roles are domain-scoped — a KYC manager cannot
 * decide a refunds approval — with `admin` standing above every domain. The
 * engine stays tool-agnostic, so the catalog lives here rather than in
 * `src/engine`.
 */
export const ROLES = [
  "kyc_reviewer",
  "kyc_manager",
  "refunds_agent",
  "refunds_manager",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

export type RoleDomain = "kyc" | "refunds";

export type RoleLevel = "agent" | "manager" | "admin";

export const ROLE_META: Record<
  Role,
  { label: string; domain: RoleDomain | null; level: RoleLevel }
> = {
  kyc_reviewer: { label: "KYC reviewer", domain: "kyc", level: "agent" },
  kyc_manager: { label: "KYC manager", domain: "kyc", level: "manager" },
  refunds_agent: { label: "Refunds agent", domain: "refunds", level: "agent" },
  refunds_manager: {
    label: "Refunds manager",
    domain: "refunds",
    level: "manager",
  },
  admin: { label: "Admin", domain: null, level: "admin" },
};

const LEVEL_RANK: Record<RoleLevel, number> = { agent: 0, manager: 1, admin: 2 };

/** Roles allowed to act in `domain` at `level` or above; admin is always included. */
export function rolesFor(domain: RoleDomain, level: RoleLevel): Role[] {
  const rank = LEVEL_RANK[level];
  return ROLES.filter(
    (role) =>
      ROLE_META[role].level === "admin" ||
      (ROLE_META[role].domain === domain && LEVEL_RANK[ROLE_META[role].level] >= rank),
  );
}

/** Every manager-or-above role across all domains. */
export const MANAGER_ROLES: Role[] = ROLES.filter(
  (role) => LEVEL_RANK[ROLE_META[role].level] >= LEVEL_RANK.manager,
);

export const ALL_ROLES: Role[] = [...ROLES];

export function roleLabel(role: Role): string {
  return ROLE_META[role].label;
}

/** Agents request; managers and admins may also decide approvals. */
export function canApprove(role: Role): boolean {
  return ROLE_META[role].level !== "agent";
}
