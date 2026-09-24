import { describe, expect, it } from "vitest";
import {
  ALL_ROLES,
  canApprove,
  MANAGER_ROLES,
  roleLabel,
  rolesFor,
} from "@/lib/roles";

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

  it("lists every manager-or-above role across domains", () => {
    expect(MANAGER_ROLES).toEqual(["kyc_manager", "refunds_manager", "admin"]);
    expect(ALL_ROLES).toHaveLength(5);
  });

  it("only lets manager-level roles and admins approve", () => {
    expect(canApprove("kyc_reviewer")).toBe(false);
    expect(canApprove("refunds_agent")).toBe(false);
    expect(canApprove("kyc_manager")).toBe(true);
    expect(canApprove("refunds_manager")).toBe(true);
    expect(canApprove("admin")).toBe(true);
  });

  it("labels every role for display", () => {
    expect(roleLabel("kyc_reviewer")).toBe("KYC reviewer");
    expect(roleLabel("admin")).toBe("Admin");
  });
});
