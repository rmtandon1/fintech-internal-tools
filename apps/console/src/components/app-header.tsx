"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@console/ui/select";
import { signOut, switchRole } from "@/app/actions";
import type { Actor } from "@console/engine/types";
import { DEMO_ROLES, roleLabel, type Role } from "@console/permissions";

const SIGN_OUT = "__sign_out";
/** How long "Now viewing as <Role>" stays once the switch has landed. */
const NOTICE_MS = 1200;

export function AppHeader({
  actor,
  roleChosen,
}: {
  actor: Actor;
  /** False until a role is picked: the switcher then asks for one. */
  roleChosen: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [switchingTo, setSwitchingTo] = useState<Role | null>(null);
  const pathname = usePathname();

  // The page fades while the role changes, then names the new role briefly.
  useEffect(() => {
    if (pending || switchingTo === null) return;
    const timer = setTimeout(() => setSwitchingTo(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [pending, switchingTo]);
  // A session already signed in as a non-demo role still sees its own label.
  const roles =
    roleChosen && !DEMO_ROLES.includes(actor.role) ? [...DEMO_ROLES, actor.role] : DEMO_ROLES;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <Wordmark className="text-base" />
      </Link>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className="text-[10px] uppercase text-muted-foreground">Viewing as</span>
        <Select
          value={roleChosen ? actor.role : ""}
          disabled={pending}
          onValueChange={(role) => {
            if (role !== SIGN_OUT) setSwitchingTo(role as Role);
            startTransition(() => (role === SIGN_OUT ? signOut() : switchRole(role, pathname)));
          }}
        >
          <SelectTrigger size="sm" className="h-8 w-[150px] text-sm sm:w-[170px]">
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role} value={role} className="text-sm">
                {roleLabel(role)}
              </SelectItem>
            ))}
            {roleChosen ? (
              <SelectItem value={SIGN_OUT} className="text-sm text-muted-foreground">
                Sign out
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>
      {switchingTo ? <RoleSwitchNotice role={switchingTo} settled={!pending} /> : null}
    </header>
  );
}

/**
 * A veil over the page while a role switch is in flight, then "Now viewing
 * as <Role>" once the new role's page has rendered. It fades in and out and
 * never takes clicks.
 */
export function RoleSwitchNotice({ role, settled }: { role: Role; settled: boolean }) {
  return (
    <div
      aria-live="polite"
      data-testid="role-switch-notice"
      data-settled={settled ? "true" : "false"}
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-[1px] animate-in fade-in-0 duration-300"
    >
      {settled ? (
        <p className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium shadow-md animate-in fade-in-0 zoom-in-95 duration-200">
          Now viewing as {roleLabel(role)}
        </p>
      ) : null}
    </div>
  );
}
