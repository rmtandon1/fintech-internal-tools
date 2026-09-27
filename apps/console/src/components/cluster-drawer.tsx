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
import { Icon } from "@console/ui/icon";
import { CountUp } from "@console/ui/motion";
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
  /** The policy outcome of the cluster's trace action for the current actor. */
  trace: RuleOutcome[] | null;
  pendingApproval: boolean;
}

/** `$1,880`, or `$1,880.50` when there are cents. */
function usd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  });
}

/**
 * Each record as a short bar under the limit line, then one bar for all of
 * them together. The picture is the point: every bar passes on its own, the
 * last one clearly doesn't.
 */
function LimitChart({
  rows,
  totalUsdMinor,
  limit,
}: {
  rows: ClusterRow[];
  totalUsdMinor: number;
  limit: { usdMinor: number; label: string };
}) {
  const max = Math.max(totalUsdMinor, limit.usdMinor) * 1.2;
  const pct = (minor: number) => `${(minor / max) * 100}%`;
  const bars = [...rows].sort((a, b) => (a.requestedAt ?? 0) - (b.requestedAt ?? 0));
  // Each refund rises in turn, then the total climbs through the limit line.
  const step = 110;
  const togetherDelay = bars.length * step + 250;

  return (
    <figure
      className="px-4 pt-5 pb-2"
      aria-label={`${bars.length} refunds each under ${limit.label}; ${usd(totalUsdMinor)} together`}
    >
      <div className="relative flex h-52 items-end gap-3 border-b border-border">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/60"
          style={{ bottom: pct(limit.usdMinor) }}
        >
          <span className="absolute left-0 -top-6 rounded-sm bg-background px-1.5 py-0.5 text-xs font-medium text-foreground">
            {limit.label}
          </span>
        </div>
        {bars.map((row, i) => (
          <div
            key={row.id}
            className="flex-1 origin-bottom rounded-t-[4px] bg-muted-foreground/45 motion-safe:animate-rise"
            style={{ height: pct(row.usdMinor), animationDelay: `${i * step}ms` }}
            title={`${row.title}: ${usd(row.usdMinor)}`}
          />
        ))}
        <div className="mx-2 h-3/4 self-center border-l border-border" />
        <div className="flex h-full flex-[1.4] flex-col justify-end" title={`Together: ${usd(totalUsdMinor)}`}>
          <CountUp
            value={totalUsdMinor / 100}
            format={{ style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: totalUsdMinor % 100 === 0 ? 0 : 2 }}
            durationMs={1000}
            delayMs={togetherDelay}
            className="mb-1 text-center text-base font-semibold tabular-nums text-foreground"
          />
          <div
            className="origin-bottom rounded-t-[4px] bg-warning shadow-[0_0_28px_-6px] shadow-warning/60 motion-safe:animate-rise motion-safe:[animation-duration:1000ms]"
            style={{ height: pct(totalUsdMinor), animationDelay: `${togetherDelay}ms` }}
          />
        </div>
      </div>
      <figcaption className="mt-1.5 flex gap-3 text-center">
        {bars.map((row) => (
          <span key={row.id} className="flex-1">
            <span className="block text-xs font-medium tabular-nums text-foreground">{usd(row.usdMinor)}</span>
            <span className="block text-[11px] text-muted-foreground">
              {row.requestedAt ? formatRelative(row.requestedAt) : ""}
            </span>
          </span>
        ))}
        <span className="mx-2 w-px" />
        <span className="flex-[1.4] text-xs font-medium text-foreground">Together</span>
      </figcaption>
    </figure>
  );
}

export function ClusterDrawer({
  label,
  headline,
  detail,
  limit,
  totalUsdMinor,
  statuses,
  ruleLabels,
  rows,
  canRequestRule,
  dispatch,
}: {
  label: string;
  headline: string;
  detail?: string;
  limit?: { usdMinor: number; label: string };
  totalUsdMinor: number;
  statuses: StatusDecl[];
  ruleLabels?: Record<string, string>;
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
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl"
        data-testid="cluster-drawer"
      >
        <SheetHeader className="gap-1 border-b border-border pr-12">
          <p className="text-xs text-muted-foreground">{label}</p>
          <SheetTitle className="text-lg leading-snug">{headline}</SheetTitle>
          {detail ? (
            <SheetDescription className="text-sm leading-relaxed">{detail}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          {limit ? <LimitChart rows={rows} totalUsdMinor={totalUsdMinor} limit={limit} /> : null}

          <h3 className="px-4 pt-4 pb-1 text-sm font-semibold text-foreground">
            The {rows.length} refunds
          </h3>
          <ol className="divide-y divide-border">
            {rows.map((row) => {
              const checks = row.trace?.length ?? 0;
              const passed = row.trace?.every((r) => r.type === "allow") ?? false;
              return (
                <li key={row.id} className="px-4 py-2.5" data-testid="cluster-row">
                  <div className="flex items-center gap-3">
                    <Link
                      href={row.href}
                      className="font-mono text-xs font-medium text-foreground hover:underline"
                    >
                      {row.title}
                    </Link>
                    <StatusChip value={row.status} statuses={statuses} />
                    <span className="ml-auto text-sm font-medium tabular-nums">
                      {row.currency === "USD"
                        ? usd(row.amountMinor)
                        : formatMinorUnits(row.amountMinor, row.currency)}
                    </span>
                  </div>
                  <details className="group mt-1 text-xs">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      {row.trace ? (
                        passed ? (
                          <>
                            <Icon name="CircleCheck" className="size-3.5 text-success" />
                            Passed all {checks} checks, no manager needed
                          </>
                        ) : row.pendingApproval ? (
                          <>
                            <Icon name="Clock" className="size-3.5 text-warning" />
                            Needs a manager
                          </>
                        ) : (
                          <>
                            <Icon name="CircleX" className="size-3.5 text-destructive" />
                            Blocked by a rule
                          </>
                        )
                      ) : (
                        "Checks run once the details are filled in"
                      )}
                      {row.trace ? (
                        <Icon name="ChevronDown" className="size-3 transition-transform group-open:rotate-180" />
                      ) : null}
                    </summary>
                    {row.trace ? (
                      <div className="mt-2 rounded-md border border-border bg-card">
                        <PolicyTraceList trace={row.trace} labels={ruleLabels} className="py-0.5" />
                      </div>
                    ) : null}
                  </details>
                </li>
              );
            })}
          </ol>
        </div>

        <SheetFooter className="mt-0 flex-row items-center gap-3 border-t border-border text-xs text-muted-foreground">
          {uncovered ? <p>No rule catches this today.</p> : null}
          {!canRequestRule ? <p>A refunds manager can ask for one.</p> : null}
          {dispatch && dispatch.length > 0 ? (
            <div className="ml-auto">
              <Button
                size="sm"
                className="h-7 text-xs"
                data-testid="dispatch-run"
                onClick={() => {
                  setAgentFocus({ kind: "handoff", offer: dispatch[0] });
                  close();
                }}
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
