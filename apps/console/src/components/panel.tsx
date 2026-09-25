import { cn } from "@console/ui/utils";

/**
 * The frame's only container: a titled region with a header and a scrolling
 * body. Every screen region is a Panel.
 */
export function Panel({
  title,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className,
      )}
    >
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
        <span className="min-w-0 truncate">{title}</span>
        {actions ? (
          <span className="ml-auto flex flex-wrap items-center gap-2 font-normal">
            {actions}
          </span>
        ) : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
