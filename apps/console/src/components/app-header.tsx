"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BrandMark, Wordmark } from "@/components/brand-mark";
import { useCommandPalette } from "@/components/command-palette";
import { ConnectionStatus } from "@/components/connection-status";
import { Icon } from "@console/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@console/ui/select";
import { signOut, switchRole } from "@/app/actions";
import type { Actor } from "@console/engine/types";
import { ROLES, roleLabel } from "@console/permissions";
import type { ConsoleStatus } from "@/lib/connection";

const SIGN_OUT = "__sign_out";

export function AppHeader({
  actor,
  roleChosen,
  status,
  agent,
}: {
  actor: Actor;
  /** False until a role is picked: the switcher then asks for one. */
  roleChosen: boolean;
  /** Server-rendered connection state; the indicator polls from here. */
  status: ConsoleStatus;
  /** Opens the Devin window. */
  agent?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const palette = useCommandPalette();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <BrandMark />
        <Wordmark className="text-base" />
      </Link>

      <button
        type="button"
        onClick={palette.open}
        className="mx-auto hidden h-8 w-80 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent md:flex"
      >
        <Icon name="Search" className="size-3.5" />
        <span>Search apps</span>
        <kbd className="ml-auto rounded border border-border bg-card px-1 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ConnectionStatus initial={status} />
        {agent}
        <Select
          value={roleChosen ? actor.role : ""}
          disabled={pending}
          onValueChange={(role) =>
            startTransition(() => (role === SIGN_OUT ? signOut() : switchRole(role)))
          }
        >
          <SelectTrigger size="sm" className="h-8 w-[150px] text-sm sm:w-[170px]">
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
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
