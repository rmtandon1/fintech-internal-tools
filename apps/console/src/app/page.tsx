import Link from "next/link";
import { Icon } from "@console/ui/icon";
import { Badge } from "@console/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@console/ui/card";
import { countPendingFor } from "@console/engine/approvals";
import { auditStats } from "@console/engine/audit/query";
import { verifyChain } from "@console/engine/audit/verify";
import { formatRelative } from "@console/ui/format";
import { canApprove } from "@console/permissions";
import { modesByGroup } from "@/lib/modes";
import { currentActor } from "@/lib/session";
import { getTool } from "@/registry";
import { cn } from "@console/ui/utils";

export default async function HomePage() {
  const actor = await currentActor();
  const stats = auditStats();
  const chain = verifyChain();
  const pending = countPendingFor(actor);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Operations home</h1>
        <p className="text-sm text-muted-foreground">
          Acting as {actor.role}. Every action below runs through the same governed write
          path: validate → idempotency → policy → approval → effect → audit.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Approvals waiting"
          value={String(pending)}
          icon="Inbox"
          href={canApprove(actor.role) ? "/inbox" : undefined}
        />
        <Stat
          label="Audit events"
          value={String(stats.total)}
          icon="ScrollText"
          hint={stats.lastTs ? `last ${formatRelative(stats.lastTs)}` : undefined}
          href="/audit"
        />
        <Stat
          label="Audit chain"
          value={chain.ok ? "Intact" : "Broken"}
          icon={chain.ok ? "ShieldCheck" : "ShieldX"}
          tone={chain.ok ? "positive" : "negative"}
          href={actor.role === "admin" ? "/audit/verify" : undefined}
        />
      </div>

      {modesByGroup().map(({ group, modes }) => (
        <section key={group} className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modes.map((mode) => {
              const decl = getTool(mode.id);
              const live = decl ? decl.visibleTo.includes(actor.role) : false;
              const permitted = mode.roles.includes(actor.role);
              const body = (
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon name={decl?.icon ?? mode.icon} className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm">
                          {decl?.displayName ?? mode.name}
                        </CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {decl?.description ?? mode.description}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="ml-auto shrink-0 text-[10px] font-normal capitalize"
                      >
                        {mode.segment === "both" ? "All segments" : mode.segment}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1 pt-0">
                    {(decl ? decl.actions.map((a) => a.name) : mode.actions)
                      .slice(0, 4)
                      .map((action) => (
                        <span
                          key={action}
                          className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {action}
                        </span>
                      ))}
                    {!permitted ? (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {mode.roles.join(", ")} only
                      </span>
                    ) : null}
                  </CardContent>
                </Card>
              );

              return (
                <Link key={mode.id} href={live ? `/t/${mode.id}` : `/roadmap/${mode.id}`}>
                  {body}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: string;
  hint?: string;
  href?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const card = (
    <Card className="h-full">
      <CardContent className="flex items-center gap-3 py-4">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-md",
            tone === "positive"
              ? "bg-emerald-500/10 text-emerald-400"
              : tone === "negative"
                ? "bg-red-500/10 text-red-400"
                : "bg-muted text-muted-foreground",
          )}
        >
          <Icon name={icon} className="size-4" />
        </div>
        <div>
          <div className="text-lg font-semibold leading-none">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {label}
            {hint ? ` · ${hint}` : ""}
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}
