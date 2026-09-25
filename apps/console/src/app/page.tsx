import Link from "next/link";
import { openApp } from "@/app/actions";
import { roleLabel } from "@console/permissions";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import { allModes, MODE_AREAS, type ModeArea, type ModeEntry } from "@/lib/modes";
import { workSummary } from "@/lib/work";
import { getTool } from "@/registry";

/** One accent per area, spelled out so Tailwind keeps every class. */
const ACCENT: Record<ModeArea, { tile: string; glow: string; hover: string }> = {
  Compliance: {
    tile: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
    glow: "from-sky-500/[0.14]",
    hover: "hover:border-sky-400/60",
  },
  "Money movement": {
    tile: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    glow: "from-emerald-500/[0.14]",
    hover: "hover:border-emerald-400/60",
  },
  Customers: {
    tile: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
    glow: "from-violet-500/[0.14]",
    hover: "hover:border-violet-400/60",
  },
  Platform: {
    tile: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    glow: "from-amber-500/[0.14]",
    hover: "hover:border-amber-400/60",
  },
};

/**
 * Every app in the console, whatever the current role. Opening a live app
 * signs in as the role it is used by and goes straight to it; apps still
 * being built open a preview of what they will look like.
 */
export default function HomePage() {
  const modes = allModes();
  const live = modes.filter((m) => m.live);
  const soon = modes.filter((m) => !m.live);
  const now = Date.now();

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-2 pt-8 pb-16 sm:px-6">
        <header className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">Internal tools</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
            Fintech Tools
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Every operations app your teams use, under one set of approvals and one
            tamper-proof audit log. Pick an app to start.
          </p>
          <div className="mt-5 flex flex-wrap gap-6 text-sm">
            <span>
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {live.length}
              </span>{" "}
              <span className="text-muted-foreground">apps in use</span>
            </span>
            <span>
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {soon.length}
              </span>{" "}
              <span className="text-muted-foreground">coming soon</span>
            </span>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <SectionHeading title="In use" count={live.length} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {live.map((mode) => (
              <LiveApp key={mode.id} mode={mode} now={now} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeading
            title="Coming soon"
            count={soon.length}
            detail="Each one gets the same approvals, checks and audit log as the apps above."
          />
          {MODE_AREAS.map((area) => {
            const inArea = soon.filter((m) => m.area === area);
            if (inArea.length === 0) return null;
            return (
              <div key={area} className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-foreground">
                  {area}
                  <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                    {inArea.length}
                  </span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {inArea.map((mode) => (
                    <SoonApp key={mode.id} mode={mode} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  count,
  detail,
}: {
  title: string;
  count: number;
  detail?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
      {detail ? <p className="w-full text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function LiveApp({ mode, now }: { mode: ModeEntry; now: number }) {
  const accent = ACCENT[mode.area];
  const decl = getTool(mode.id);
  const open = decl ? workSummary(decl, now).open : null;

  return (
    <form action={openApp.bind(null, mode.id)} className="contents">
      <button
        type="submit"
        className={cn(
          "group relative flex min-h-60 flex-col overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40",
          accent.hover,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-100",
            accent.glow,
          )}
        />
        <span className="relative flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-lg ring-1",
              accent.tile,
            )}
          >
            <Icon name={mode.icon} className="size-6" />
          </span>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            In use
          </span>
        </span>

        <span className="relative mt-5 text-xs font-medium text-muted-foreground">
          {mode.area}
        </span>
        <span className="relative mt-1 text-xl font-semibold tracking-tight text-foreground">
          {mode.name}
        </span>
        <span className="relative mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {mode.description}
        </span>

        <span className="relative mt-auto flex items-end justify-between gap-3 pt-5">
          <span className="flex flex-col">
            {open !== null ? (
              <span>
                <span className="text-2xl font-semibold tabular-nums text-foreground">{open}</span>
                <span className="ml-1.5 text-sm text-muted-foreground">open</span>
              </span>
            ) : null}
            {mode.launchRole ? (
              <span className="text-xs text-muted-foreground">
                Opens as {roleLabel(mode.launchRole)}
              </span>
            ) : null}
          </span>
          <span className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-foreground/40 group-hover:bg-foreground group-hover:text-background">
            <Icon name="ArrowRight" className="size-4" />
          </span>
        </span>
      </button>
    </form>
  );
}

function SoonApp({ mode }: { mode: ModeEntry }) {
  return (
    <Link
      href={mode.href}
      className="group flex items-start gap-3 rounded-lg border border-border/70 bg-card/40 p-4 transition-colors hover:border-foreground/25 hover:bg-card"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon name={mode.icon} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{mode.name}</span>
        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">
          {mode.description}
        </span>
      </span>
    </Link>
  );
}
