"use client";

import { useTransition } from "react";
import { Icon } from "@console/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@console/ui/select";
import { switchRole } from "@/app/actions";
import type { Actor } from "@console/engine/types";
import { ROLES, roleLabel } from "@console/permissions";
import { cn } from "@console/ui/utils";

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

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-6">
      <div className="text-sm text-muted-foreground">
        Internal operations · <span className="text-foreground">demo environment</span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
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
          <Icon name={chainOk ? "ShieldCheck" : "ShieldX"} className="size-3.5" />
          {chainOk ? "Chain OK" : "Chain broken"}
          <span className="text-muted-foreground">· {chainLength}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Acting as</span>
          <Select
            value={actor.role}
            disabled={pending}
            onValueChange={(role) => startTransition(() => switchRole(role))}
          >
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {roleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  );
}
