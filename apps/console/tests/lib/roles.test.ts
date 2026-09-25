import { describe, expect, it } from "vitest";
import {
  ALL_ROLES,
  canApprove,
  MANAGER_ROLES,
  ROLE_META,
  ROLES,
  roleLabel,
  rolesFor,
} from "@console/permissions";
import { DEMO_ACTORS } from "@console/engine/actor";
import { TOOLS, toolsForRole } from "@/registry";

describe("role catalog", () => {
  it("scopes agents and managers to their domain, with admin above all", () => {
    expect(rolesFor("kyc", "agent")).toEqual(["kyc_reviewer", "kyc_manager", "admin"]);
    expect(rolesFor("kyc", "manager")).toEqual(["kyc_manager", "admin"]);
    expect(rolesFor("refunds", "agent")).toEqual([
      "refunds_agent",
      "refunds_manager",
      "admin",
    ]);
    expect(rolesFor("refunds", "manager")).toEqual(["refunds_manager", "admin"]);
    expect(rolesFor("refunds", "admin")).toEqual(["admin"]);
  });

  it("never grants the engineer a domain role or tool", () => {
    for (const domain of ["kyc", "refunds"] as const) {
      for (const level of ["engineer", "agent", "manager", "admin"] as const) {
        expect(rolesFor(domain, level)).not.toContain("engineer");
      }
    }
    expect(ROLE_META.engineer).toEqual({
      label: "Engineer",
      domain: null,
      level: "engineer",
    });
    expect(ROLES).toContain("engineer");
    expect(DEMO_ACTORS.engineer).toEqual({
      id: "usr_engineer",
      name: "Engineer",
      role: "engineer",
    });
    expect(toolsForRole("engineer").map((t) => t.name)).toEqual(["automation"]);
    for (const tool of TOOLS.filter((t) => t.name !== "automation")) {
      expect(tool.visibleTo).not.toContain("engineer");
    }
  });

  it("lists every manager-or-above role across domains", () => {
    expect(MANAGER_ROLES).toEqual(["kyc_manager", "refunds_manager", "admin"]);
    expect(ALL_ROLES).toHaveLength(6);
    expect(MANAGER_ROLES).not.toContain("engineer");
  });

  it("only lets manager-level roles and admins approve", () => {
    expect(canApprove("kyc_reviewer")).toBe(false);
    expect(canApprove("refunds_agent")).toBe(false);
    expect(canApprove("engineer")).toBe(false);
    expect(canApprove("kyc_manager")).toBe(true);
    expect(canApprove("refunds_manager")).toBe(true);
    expect(canApprove("admin")).toBe(true);
  });

  it("labels every role for display", () => {
    expect(roleLabel("kyc_reviewer")).toBe("KYC reviewer");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("engineer")).toBe("Engineer");
  });
});
