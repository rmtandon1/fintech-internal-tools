"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@console/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@console/ui/tooltip";
import type { Actor } from "@console/engine/types";
import { canApprove } from "@console/permissions";
import { cn } from "@console/ui/utils";

interface ToolLink {
  name: string;
  displayName: string;
  icon: string;
}

interface RailItem {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function AppSidebar({
  actor,
  roleChosen,
  tools,
  runs,
  pendingApprovals,
}: {
  actor: Actor;
  /** False until a role is picked; the rail then offers only Home. */
  roleChosen: boolean;
  tools: ToolLink[];
  /** Whether this role sees the `automation` tool, and so the RUNS list. */
  runs: boolean;
  pendingApprovals: number;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const items: RailItem[] = [
    { href: "/", label: "Home", icon: "Home", active: pathname === "/" || pathname.startsWith("/roadmap") },
    ...tools.map((tool) => ({
      href: `/t/${tool.name}`,
      label: tool.displayName,
      icon: tool.icon,
      active: pathname.startsWith(`/t/${tool.name}`),
    })),
    ...(runs
      ? [
          {
            href: "/runs",
            label: "Rule changes",
            icon: "Bot",
            active: pathname.startsWith("/runs") || pathname.startsWith("/t/automation"),
          },
        ]
      : []),
    ...(roleChosen && canApprove(actor.role)
      ? [
          {
            href: "/inbox",
            label: "Approvals",
            icon: "Inbox",
            active: pathname === "/inbox",
            badge: pendingApprovals,
          },
        ]
      : []),
    ...(roleChosen
      ? [
          {
            href: "/audit",
            label: "Audit log",
            icon: "ScrollText",
            active: pathname === "/audit",
          },
        ]
      : []),
    ...(roleChosen && actor.role === "admin"
      ? [
          {
            href: "/audit/verify",
            label: "Verify audit log",
            icon: "ShieldCheck",
            active: pathname === "/audit/verify",
          },
          {
            href: "/admin/policy",
            label: "Rule settings",
            icon: "SlidersHorizontal",
            active: pathname === "/admin/policy",
          },
        ]
      : []),
  ];

  // Close the overlay on navigation and on outside interaction.
  useEffect(() => {
    setExpanded(false);
  }, [pathname]);

  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(event: PointerEvent) {
      if (asideRef.current && !asideRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "[" && !isEditable(event.target)) {
        setExpanded((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <aside
      ref={asideRef}
      className="relative z-40 flex w-14 shrink-0 flex-col border-r border-border bg-sidebar"
    >
      <TooltipProvider delayDuration={0}>
        <nav className="flex flex-1 flex-col items-center gap-1 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label="Toggle navigation"
                className={cn(
                  "flex size-8 items-center justify-center rounded-md transition-colors",
                  expanded
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon name="PanelLeft" className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Menu</TooltipContent>
          </Tooltip>

          {items.map((item) => (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-md transition-colors",
                    item.active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon name={item.icon} className="size-4" />
                  {item.badge ? (
                    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warning px-1 text-[9px] font-semibold tabular-nums text-warning-foreground">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
      </TooltipProvider>

      {expanded ? (
        <div className="absolute inset-y-0 left-0 z-40 w-60 border-r border-border bg-sidebar">
          <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex h-8 items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Icon name="PanelLeft" className="size-4 shrink-0" />
              Menu
            </button>
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-sm px-2 text-xs",
                  item.active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon name={item.icon} className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto text-[11px] tabular-nums text-warning">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </aside>
  );
}
