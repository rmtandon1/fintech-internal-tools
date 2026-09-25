"use client";

import { useTransition } from "react";
import { useCommandPalette } from "@/components/command-palette";
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
import { cn } from "@console/ui/utils";

const SIGN_OUT = "__sign_out";

export function AppHeader({
  actor,
  roleChosen,
  chainOk,
  chainLength,
  agent,
}: {
  actor: Actor;
  /** False until a role is picked: the switcher then asks for one. */
  roleChosen: boolean;
  chainOk: boolean;
  chainLength: number;
  /** Opens the Devin window. */
  agent?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const palette = useCommandPalette();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
      <div className="shrink-0 text-[13px] font-semibold tracking-tight">Fintech Tools</div>

      <button
        type="button"
        onClick={palette.open}
        className="mx-auto hidden h-7 w-72 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-xs text-muted-foreground md:flex"
      >
        <Icon name="Search" className="size-3.5" />
        <span>Search apps</span>
        <kbd className="ml-auto font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {agent}
        <div
          className={cn(
            "hidden h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] sm:flex",
            chainOk
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400",
          )}
          title={
            chainOk
              ? `All ${chainLength} audit log entries verified: none edited or removed`
              : "The audit log failed verification: an entry was edited or removed"
          }
        >
          <Icon name={chainOk ? "ShieldCheck" : "ShieldX"} className="size-3" />
          {chainOk ? (
            <>
              Audit log verified
            </>
          ) : (
            "Audit log tampered"
          )}
        </div>

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
