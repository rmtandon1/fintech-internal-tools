import Link from "next/link";
import { Icon } from "./icon";
import { cn } from "./utils";

/**
 * One headline count: a sentence-case label over a large value. A warning
 * tone carries an icon as well as colour, so the state never reads by colour
 * alone. With `href` the whole card links to the rows it counts.
 */
export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: string;
  tone?: "neutral" | "warning" | "positive" | "negative";
  hint?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon ? (
          <Icon
            name={icon}
            className={cn(
              "size-3.5",
              tone === "warning" && "text-warning",
              tone === "positive" && "text-success",
              tone === "negative" && "text-destructive",
            )}
          />
        ) : null}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-semibold leading-none tracking-tight",
          tone === "warning" && "text-warning",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</div> : null}
    </>
  );
  const frame = cn(
    "block min-w-0 rounded-xl border border-border bg-card px-4 py-3 shadow-xs",
    className,
  );
  return href ? (
    <Link href={href} className={cn(frame, "transition-colors hover:border-ring/60 hover:bg-accent/40")}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
