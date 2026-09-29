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
import { actorFromCookie, DEFAULT_ACTOR, DEMO_ACTORS } from "@console/engine/actor";
import { TOOLS, toolsForRole } from "@/registry";

describe("role catalog", () => {
  it("shares analyst and manager roles across queues without adding admin", () => {
    expect(rolesFor("kyc", "agent")).toEqual(["analyst", "manager"]);
    expect(rolesFor("kyc", "manager")).toEqual(["manager"]);
    expect(rolesFor("refunds", "agent")).toEqual(["analyst", "manager"]);
    expect(rolesFor("refunds", "manager")).toEqual(["manager"]);
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

  it("lists the four shared demo roles", () => {
    expect(MANAGER_ROLES).toEqual(["manager", "admin"]);
    expect(ALL_ROLES).toEqual(["analyst", "manager", "engineer", "admin"]);
    expect(MANAGER_ROLES).not.toContain("engineer");
  });

  it("only lets managers and admins approve", () => {
    expect(canApprove("analyst")).toBe(false);
    expect(canApprove("engineer")).toBe(false);
    expect(canApprove("manager")).toBe(true);
    expect(canApprove("admin")).toBe(true);
  });

  it("labels every role for display", () => {
    expect(roleLabel("analyst")).toBe("Analyst");
    expect(roleLabel("manager")).toBe("Manager");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("engineer")).toBe("Engineer");
  });

  it("falls back to the stored value for a legacy role", () => {
    expect(roleLabel("refunds_agent")).toBe("refunds_agent");
  });

  it("uses the analyst as the default and ignores a stale role cookie", () => {
    expect(DEFAULT_ACTOR).toBe(DEMO_ACTORS.analyst);
    expect(actorFromCookie("stale.invalid")).toBe(DEFAULT_ACTOR);
    expect(DEMO_ACTORS.analyst.id).toBe("usr_analyst");
    expect(DEMO_ACTORS.manager.id).toBe("usr_manager");
    expect(DEMO_ACTORS.analyst.name).toBe("Analyst");
    expect(DEMO_ACTORS.manager.name).toBe("Manager");
  });
});
