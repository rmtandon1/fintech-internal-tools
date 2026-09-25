"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PolicyTraceList } from "@console/ui/policy-trace";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@console/ui/sheet";
import { StatusChip } from "@console/ui/status-chip";
import { Button } from "@console/ui/button";
import { useWorkspace } from "@/components/workspace";
import type { HandoffOffer } from "@/lib/handoff";
import { formatMinorUnits, formatRelative } from "@console/ui/format";
import type { RuleOutcome, StatusDecl } from "@console/engine/types";

/** One record inside an open cluster group, already masked on the server. */
export interface ClusterRow {
  id: string;
  href: string;
  title: string;
  status: string;
  amountMinor: number;
  currency: string;
  usdMinor: number;
  requestedAt: number | null;
  /** Masked PII fields, label to value. */
  identity: { label: string; value: string }[];
  /** The policy outcome of the cluster's trace action for the current actor. */
  trace: RuleOutcome[] | null;
  pendingApproval: boolean;
}

export function ClusterDrawer({
  label,
  clusterLabel,
  count,
  qualifier,
  totalUsdMinor,
  windowDays,
  traceAction,
  statuses,
  rows,
  canRequestRule,
  dispatch,
}: {
  label: string;
  clusterLabel: string;
  count: number;
  qualifier?: string;
  totalUsdMinor: number;
  windowDays?: number;
  traceAction?: string;
  statuses: StatusDecl[];
  rows: ClusterRow[];
  canRequestRule: boolean;
  /** Handoffs this actor may ask Devin for from the cluster's spec. */
  dispatch?: HandoffOffer[] | null;
}) {
  const { setAgentFocus } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const close = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("inspect");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const uncovered = !rows.some((row) => row.pendingApproval);

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-2xl"
        data-testid="cluster-drawer"
      >
        <SheetHeader className="border-b border-border pr-12">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {clusterLabel}
          </p>
          <SheetTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>{label}</span>
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {count} {qualifier ?? (count === 1 ? "record" : "records")}
              {windowDays ? ` · ${windowDays}d` : ""}
            </span>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground tabular-nums">
                {formatMinorUnits(totalUsdMinor, "USD")}
              </span>
              <span className="text-xs text-muted-foreground">total USD equivalent</span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <ol className="min-h-0 flex-1 divide-y divide-border overflow-auto">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3" data-testid="cluster-row">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={row.href}
                  className="font-mono text-xs font-medium text-foreground hover:underline"
                >
                  {row.title}
                </Link>
                <StatusChip value={row.status} statuses={statuses} />
                <span className="ml-auto text-xs tabular-nums">
                  {formatMinorUnits(row.amountMinor, row.currency)}
                  {row.currency !== "USD" ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatMinorUnits(row.usdMinor, "USD")}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {row.identity.map((field) => (
                  <span key={field.label}>
                    {field.label}{" "}
                    <span className="font-mono text-foreground">{field.value}</span>
                  </span>
                ))}
                {row.requestedAt ? <span>{formatRelative(row.requestedAt)}</span> : null}
              </div>
              <div className="mt-2 rounded-md border border-border bg-card">
                <div className="flex h-7 items-center border-b border-border px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Policy trace
                  {traceAction ? (
                    <span className="ml-1 font-mono normal-case tracking-normal">
                      · {traceAction}
                    </span>
                  ) : null}
                </div>
                {row.trace ? (
                  <PolicyTraceList trace={row.trace} className="py-0.5" />
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Policy runs once required input is supplied.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <SheetFooter className="mt-0 flex-row items-center gap-3 border-t border-border text-xs text-muted-foreground">
          {uncovered ? <p>No rule covers this pattern.</p> : null}
          {!canRequestRule ? <p>A refunds manager can ask for a rule.</p> : null}
          {dispatch && dispatch.length > 0 ? (
            <div className="ml-auto">
              <Button
                size="sm"
                className="h-7 text-xs"
                data-testid="dispatch-run"
                onClick={() => setAgentFocus({ kind: "handoff", offer: dispatch[0] })}
              >
                Ask Devin for a rule
              </Button>
            </div>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
