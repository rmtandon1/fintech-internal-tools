import Link from "next/link";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import { Panel } from "@/components/panel";
import { MODE_AREAS, modesFor, type ModeEntry } from "@/lib/modes";
import { currentActor } from "@/lib/session";

/** Every mode this role may open, live tools and pending ones, grouped by area. */
export default async function AppsPage() {
  const actor = await currentActor();
  const modes = modesFor(actor.role);
  const live = modes.filter((m) => m.live).length;

  return (
    <Panel
      title={`Apps · ${modes.length}`}
      actions={
        <span className="text-[11px] text-muted-foreground">
          <span className="text-emerald-400 tabular-nums">{live}</span> in use ·{" "}
          <span className="tabular-nums">{modes.length - live}</span> coming soon
        </span>
      }
      className="h-full"
    >
      <div className="flex flex-col gap-5 p-4">
        {MODE_AREAS.map((area) => {
          const inArea = modes.filter((m) => m.area === area);
          if (inArea.length === 0) return null;
          return (
            <section key={area} className="flex flex-col gap-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {area}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {inArea.map((mode) => (
                  <AppTile key={mode.id} mode={mode} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}

function AppTile({ mode }: { mode: ModeEntry }) {
  return (
    <Link
      href={mode.href}
      className={cn(
        "group flex flex-col gap-3 rounded-md border p-3 transition-colors",
        mode.live
          ? "border-emerald-500/25 bg-emerald-500/[0.04] hover:border-emerald-500/50"
          : "border-border bg-background/40 hover:border-foreground/25 hover:bg-accent/30",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border",
            mode.live
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-border bg-muted text-muted-foreground group-hover:text-foreground",
          )}
        >
          <Icon name={mode.icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{mode.name}</span>
            <span
              className={cn(
                "ml-auto shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
                mode.live
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-border text-muted-foreground",
              )}
            >
              {mode.live ? "In use" : "Coming soon"}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{mode.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {mode.actions.slice(0, 4).map((action) => (
          <span
            key={action}
            className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {action}
          </span>
        ))}
      </div>
    </Link>
  );
}
