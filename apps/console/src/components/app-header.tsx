"use client";

import Link from "next/link";
import { useTransition } from "react";
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
import { DEMO_ROLES, roleLabel } from "@console/permissions";

const SIGN_OUT = "__sign_out";

export function AppHeader({
  actor,
  roleChosen,
}: {
  actor: Actor;
  /** False until a role is picked: the switcher then asks for one. */
  roleChosen: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
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
          onValueChange={(role) =>
            startTransition(() => (role === SIGN_OUT ? signOut() : switchRole(role, pathname)))
          }
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
    </header>
  );
}
