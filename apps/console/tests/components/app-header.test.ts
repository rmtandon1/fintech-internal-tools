import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEMO_ROLES } from "@console/permissions";

vi.mock("@/app/actions", () => ({ signOut: vi.fn(), switchRole: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/t/refunds" }));

import { AppHeader, RoleSwitchNotice } from "@/components/app-header";

describe("AppHeader", () => {
  it("offers analyst, manager and admin, never the engineer", () => {
    expect(DEMO_ROLES).not.toContain("engineer");
    const html = renderToStaticMarkup(
      createElement(AppHeader, { actor: { id: "usr_admin", name: "Admin", role: "admin" }, roleChosen: true }),
    );
    expect(html).toContain("Viewing as");
    expect(html).not.toContain('data-testid="role-switch-notice"');
  });

  it("fades the page while the role changes, then says who is viewing", () => {
    const fading = renderToStaticMarkup(createElement(RoleSwitchNotice, { role: "manager", settled: false }));
    expect(fading).toContain('data-testid="role-switch-notice"');
    expect(fading).toContain("pointer-events-none fixed inset-0");
    expect(fading).toContain("fade-in-0");
    expect(fading).not.toContain("Now viewing as");
    const settled = renderToStaticMarkup(createElement(RoleSwitchNotice, { role: "manager", settled: true }));
    expect(settled).toContain("Now viewing as Manager");
  });
});
