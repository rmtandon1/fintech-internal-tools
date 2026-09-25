import Link from "next/link";
import { openApp } from "@/app/actions";
import { listApprovals } from "@console/engine/approvals";
import { verifyChain } from "@console/engine/audit/verify";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import { BrandMark, Wordmark } from "@/components/brand-mark";
import { BRAND } from "@/lib/brand";
import { devinMode } from "@/lib/devin-status";
import { allModes, MODE_AREAS, type ModeArea, type ModeEntry } from "@/lib/modes";
import { workSummary } from "@/lib/work";
import { getTool } from "@/registry";

/** One accent per area, spelled out so Tailwind keeps every class. */
const AREA: Record<ModeArea, { icon: string; tile: string; glow: string; hover: string }> = {
  Compliance: {
    icon: "ShieldCheck",
    tile: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
    glow: "from-sky-500/[0.14]",
    hover: "hover:border-sky-400/60",
  },
  "Money movement": {
    icon: "Banknote",
    tile: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    glow: "from-emerald-500/[0.14]",
    hover: "hover:border-emerald-400/60",
  },
  Customers: {
    icon: "Users",
    tile: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
    glow: "from-rose-500/[0.14]",
    hover: "hover:border-rose-400/60",
  },
  Platform: {
    icon: "Cpu",
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

  const chain = verifyChain();
  const waiting = listApprovals("pending").length;
  const devin = devinMode();

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-14 px-2 pt-10 pb-16 sm:px-6">
        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <BrandMark size="lg" />
            <h1>
              <Wordmark className="text-5xl" />
            </h1>
          </div>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{BRAND.tagline}</p>
          <ul className="flex flex-wrap gap-2">
            <Status
              tone={chain.ok ? "good" : "bad"}
              label={
                !chain.ok
                  ? "Audit log tampered with"
                  : chain.length === 0
                    ? "Audit log ready · no entries yet"
                    : `Audit log verified · ${chain.length} ${chain.length === 1 ? "entry" : "entries"}`
              }
            />
            <Status
              tone={waiting > 0 ? "attention" : "good"}
              label={
                waiting === 0
                  ? "No approvals waiting"
                  : `${waiting} ${waiting === 1 ? "approval" : "approvals"} waiting`
              }
            />
            <Status
              tone={devin === "live" ? "good" : "neutral"}
              label={devin === "live" ? "Devin connected" : "Devin in preview"}
            />
            <Status tone="neutral" label={`${live.length} apps live · ${soon.length} on the way`} />
          </ul>
        </header>

        <section className="flex flex-col gap-5">
          <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
            </span>
            Live
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {live.map((mode) => (
              <LiveApp key={mode.id} mode={mode} now={now} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Coming next</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each new app gets approvals, checks and the audit log from day one.
            </p>
          </div>
          <div className="grid items-start gap-4 md:grid-cols-2">
            {MODE_AREAS.map((area) => {
              const inArea = soon.filter((m) => m.area === area);
              if (inArea.length === 0) return null;
              return <AreaBoard key={area} area={area} modes={inArea} />;
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Status({
  tone,
  label,
}: {
  tone: "good" | "attention" | "bad" | "neutral";
  label: string;
}) {
  const styles = {
    good: { chip: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200", dot: "bg-emerald-400" },
    attention: { chip: "border-amber-500/30 bg-amber-500/[0.08] text-amber-200", dot: "bg-amber-400" },
    bad: { chip: "border-red-500/40 bg-red-500/10 text-red-200", dot: "bg-red-400" },
    neutral: { chip: "border-border bg-card text-muted-foreground", dot: "bg-muted-foreground/60" },
  }[tone];
  return (
    <li
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
        styles.chip,
      )}
    >
      <span className={cn("size-1.5 rounded-full", styles.dot)} />
      {label}
    </li>
  );
}

function LiveApp({ mode, now }: { mode: ModeEntry; now: number }) {
  const area = AREA[mode.area];
  const decl = getTool(mode.id);
  const open = decl ? workSummary(decl, now).open : null;

  return (
    <form action={openApp.bind(null, mode.id)} className="contents">
      <button
        type="submit"
        className={cn(
          "group relative flex min-h-56 flex-col overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40",
          area.hover,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-100",
            area.glow,
          )}
        />
        <span className="relative flex items-start justify-between gap-3">
          <span className={cn("flex size-12 items-center justify-center rounded-lg ring-1", area.tile)}>
            <Icon name={mode.icon} className="size-6" />
          </span>
          <span className="text-xs text-muted-foreground">{mode.area}</span>
        </span>

        <span className="relative mt-5 text-xl font-semibold tracking-tight text-foreground">
          {mode.name}
        </span>
        <span className="relative mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {mode.description}
        </span>

        <span className="relative mt-auto flex items-end justify-between gap-3 pt-5">
          {open !== null ? (
            <span>
              <span className="text-2xl font-semibold tabular-nums text-foreground">{open}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">open</span>
            </span>
          ) : (
            <span />
          )}
          <span className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-foreground/40 group-hover:bg-foreground group-hover:text-background">
            <Icon name="ArrowRight" className="size-4" />
          </span>
        </span>
      </button>
    </form>
  );
}

/** One area of the roadmap: a titled card listing the apps coming to it. */
function AreaBoard({ area, modes }: { area: ModeArea; modes: ModeEntry[] }) {
  const style = AREA[area];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent",
          style.glow,
        )}
      />
      <div className="relative flex items-center gap-3 px-5 pt-5 pb-3">
        <span className={cn("flex size-9 items-center justify-center rounded-lg ring-1", style.tile)}>
          <Icon name={style.icon} className="size-[18px]" />
        </span>
        <h3 className="text-base font-semibold">{area}</h3>
      </div>
      <ul className="relative px-2 pb-2">
        {modes.map((mode) => (
          <li key={mode.id}>
            <Link
              href={mode.href}
              className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50"
            >
              <Icon
                name={mode.icon}
                className="mt-0.5 size-[18px] shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{mode.name}</span>
                <span className="block text-[13px] leading-snug text-muted-foreground">
                  {mode.description}
                </span>
              </span>
              <Icon
                name="ChevronRight"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
