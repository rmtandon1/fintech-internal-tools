import type { MouseEventHandler } from "react";
import { GitHubMark } from "@console/ui/github-mark";
import { cn } from "@console/ui/utils";

const STYLE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 font-mono text-[11px] font-medium text-foreground shadow-xs";

/** The one way a pull request is linked on screen: GitHub's mark and `PR #N`. */
export function PrButton({
  url,
  number,
  className,
  onClick,
}: {
  url: string | null;
  number: number | null;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const label = `PR #${number ?? "?"}`;
  if (!url) {
    return (
      <span className={cn(STYLE, "text-muted-foreground", className)} data-testid="pr-button">
        <GitHubMark className="size-3.5" />
        {label}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className={cn(STYLE, "hover:bg-accent", className)}
      data-testid="pr-button"
    >
      <GitHubMark className="size-3.5" />
      {label}
    </a>
  );
}
