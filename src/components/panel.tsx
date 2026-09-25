import { cn } from "@/lib/utils";

/**
 * The frame's only container: a titled region with a compact header and a
 * scrolling body. Every screen region is a Panel.
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
        "flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card",
        className,
      )}
    >
      <header className="flex min-h-8 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="min-w-0 truncate">{title}</span>
        {actions ? (
          <span className="ml-auto flex flex-wrap items-center gap-2 normal-case tracking-normal">
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
