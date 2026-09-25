import Link from "next/link";
import { countPendingFor } from "@console/engine/approvals";
import type { Actor, ToolDeclaration } from "@console/engine/types";
import { canApprove, roleLabel } from "@console/permissions";
import { automationTool } from "@console/tool-automation";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import { resolveStat, statsFor } from "@/lib/stats";
import { currentActor } from "@/lib/session";
import { workSummary } from "@/lib/work";
import { toolsForRole } from "@/registry";

/**
 * One tile per tool this role works in: how much is open, what needs them,
 * and the way in. Every number is a live query and links to the rows it counts.
 */
export default async function HomePage() {
  const actor = await currentActor();
  const now = Date.now();
  const tools = toolsForRole(actor.role).filter((t) => t.name !== automationTool.name);
  const approvals = canApprove(actor.role) ? countPendingFor(actor) : 0;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-1 py-4 sm:px-4">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Your tools</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {roleLabel(actor.role)}.
          </p>
        </header>

        {approvals > 0 ? (
          <Link
            href="/inbox"
            className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-4 py-3 transition-colors hover:border-amber-500/70"
          >
            <Icon name="Inbox" className="size-5 text-amber-400" />
            <span className="text-sm">
              <span className="font-semibold tabular-nums">{approvals}</span>{" "}
              {approvals === 1 ? "request needs" : "requests need"} your approval
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-amber-300">
              Review
              <Icon name="ArrowRight" className="size-4" />
            </span>
          </Link>
        ) : null}

        {tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tools are set up for your role yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tools.map((decl) => (
              <ToolTile key={decl.name} decl={decl} actor={actor} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolTile({ decl, actor, now }: { decl: ToolDeclaration; actor: Actor; now: number }) {
  const { open } = workSummary(decl, now);
  const stats = statsFor(decl, actor).map((stat) => ({ stat, ...resolveStat(decl, actor, stat) }));

  return (
    <section className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-foreground">
          <Icon name={decl.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{decl.displayName}</h2>
          <p className="text-sm text-muted-foreground">{decl.description}</p>
        </div>
      </div>

      <div className="px-4 pb-3">
        <span className="text-3xl font-semibold tabular-nums">{open}</span>
        <span className="ml-2 text-sm text-muted-foreground">open</span>
      </div>

      {stats.length > 0 ? (
        <ul className="border-t border-border">
          {stats.map(({ stat, value, href }) => {
            const alert = stat.tone === "warning" && value > 0;
            return (
              <li key={stat.key}>
                <Link
                  href={href}
                  className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-accent/40"
                >
                  <span className={cn("text-muted-foreground", alert && "text-amber-400")}>
                    {stat.label}
                  </span>
                  <span
                    className={cn(
                      "ml-auto font-semibold tabular-nums",
                      alert ? "text-amber-400" : value === 0 && "text-muted-foreground",
                    )}
                  >
                    {value}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Link
        href={`/t/${decl.name}`}
        className="mt-auto flex items-center justify-between border-t border-border px-4 py-3 text-sm font-medium hover:bg-accent/40"
      >
        Open {decl.displayName}
        <Icon name="ArrowRight" className="size-4" />
      </Link>
    </section>
  );
}
