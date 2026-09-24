"use client";

import { useTransition } from "react";
import { useCommandPalette } from "@/components/command-palette";
import { Icon } from "@/components/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { switchRole } from "@/app/actions";
import type { Actor } from "@/engine/types";
import { ROLES } from "@/engine/types";
import { cn } from "@/lib/utils";

export function AppHeader({
  actor,
  chainOk,
  chainLength,
}: {
  actor: Actor;
  chainOk: boolean;
  chainLength: number;
}) {
  const [pending, startTransition] = useTransition();
  const palette = useCommandPalette();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
      <div className="text-[13px] font-semibold tracking-tight">Fintech Tools</div>

      <button
        type="button"
        onClick={palette.open}
        className="mx-auto flex h-7 w-72 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-xs text-muted-foreground"
      >
        <Icon name="Search" className="size-3.5" />
        <span>Search modes…</span>
        <kbd className="ml-auto font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        <div
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px]",
            chainOk
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400",
          )}
          title={
            chainOk
              ? `Audit chain intact across ${chainLength} events`
              : "Audit chain verification failed"
          }
        >
          <Icon name={chainOk ? "ShieldCheck" : "ShieldX"} className="size-3" />
          {chainOk ? (
            <>
              Chain OK · <span className="tabular-nums">{chainLength}</span>
            </>
          ) : (
            "Chain broken"
          )}
        </div>

        <Select
          value={actor.role}
          disabled={pending}
          onValueChange={(role) => startTransition(() => switchRole(role))}
        >
          <SelectTrigger size="sm" className="h-7 w-[110px] text-xs capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role} className="text-xs capitalize">
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
