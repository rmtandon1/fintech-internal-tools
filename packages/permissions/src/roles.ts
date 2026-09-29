/** The engine stays tool-agnostic, so the catalog lives here. */
export const ROLES = [
  "analyst",
  "manager",
  "engineer",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

export const DEMO_ROLES: readonly Role[] = [
  "analyst",
  "manager",
  "admin",
  "engineer",
];

export type RoleDomain = "kyc" | "refunds";

export type RoleLevel = "engineer" | "agent" | "manager" | "admin";

export const ROLE_META: Record<Role, { label: string; level: RoleLevel }> = {
  analyst: { label: "Analyst", level: "agent" },
  manager: { label: "Manager", level: "manager" },
  admin: { label: "Admin", level: "admin" },
  engineer: { label: "Engineer", level: "engineer" },
};

const LEVEL_RANK: Record<RoleLevel, number> = {
  engineer: -1,
  agent: 0,
  manager: 1,
  admin: 2,
};

/** All queues share roles. Admin is reserved for the admin level; engineer is never a queue role. */
export function rolesFor(_domain: RoleDomain, level: RoleLevel): Role[] {
  if (level === "admin") return ["admin"];
  const rank = LEVEL_RANK[level];
  return ROLES.filter(
    (role) =>
      ROLE_META[role].level !== "admin" &&
      ROLE_META[role].level !== "engineer" &&
      LEVEL_RANK[ROLE_META[role].level] >= rank,
  );
}

export const MANAGER_ROLES: Role[] = ["manager", "admin"];

export const ALL_ROLES: Role[] = [...ROLES];

export function roleLabel(role: string): string {
  return ROLE_META[role as Role]?.label ?? role;
}

/** Managers and admins may decide approvals. */
export function canApprove(role: Role): boolean {
  return role === "manager" || role === "admin";
}
