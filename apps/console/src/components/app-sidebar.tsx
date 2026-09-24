"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@console/ui/icon";
import { Badge } from "@console/ui/badge";
import type { Actor } from "@console/engine/types";
import { canApprove } from "@console/permissions";
import { cn } from "@console/ui/utils";

interface ToolLink {
  name: string;
  displayName: string;
  icon: string;
}

export function AppSidebar({
  actor,
  tools,
  pendingApprovals,
}: {
  actor: Actor;
  tools: ToolLink[];
  pendingApprovals: number;
}) {
  const pathname = usePathname();

  const governance = [
    { href: "/inbox", label: "Approvals", icon: "Inbox", show: canApprove(actor.role), badge: pendingApprovals },
    { href: "/audit", label: "Audit stream", icon: "ScrollText", show: true },
    { href: "/audit/verify", label: "Chain verify", icon: "ShieldCheck", show: actor.role === "admin" },
    { href: "/admin/policy", label: "Policy constants", icon: "SlidersHorizontal", show: actor.role === "admin" },
  ].filter((item) => item.show);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex size-7 items-center justify-center rounded bg-primary/15 text-primary">
          <Icon name="Hexagon" className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Meridian</div>
          <div className="text-[11px] text-muted-foreground">Ops Console</div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <Section title="Overview">
          <NavItem href="/" label="Home" icon="LayoutDashboard" active={pathname === "/"} />
        </Section>

        <Section title="Tools">
          {tools.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No tools registered yet</p>
          ) : (
            tools.map((tool) => (
              <NavItem
                key={tool.name}
                href={`/t/${tool.name}`}
                label={tool.displayName}
                icon={tool.icon}
                active={pathname.startsWith(`/t/${tool.name}`)}
              />
            ))
          )}
        </Section>

        <Section title="Governance">
          {governance.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname === item.href}
              badge={item.badge}
            />
          ))}
        </Section>
      </nav>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon name={icon} className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge ? (
        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[11px]">
          {badge}
        </Badge>
      ) : null}
    </Link>
  );
}
