import { Icon } from "@console/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@console/ui/sheet";
import { Panel } from "@/components/panel";
import { cn } from "@console/ui/utils";

/**
 * The right-hand column where Devin's work shows. This shell only knows the
 * "No runs" state; the handoff panel and run view mount into `children`.
 * A resizable pane beside `main` from `lg` up, behind a header button below it.
 */
export function AgentColumn({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="flex h-full flex-col p-3 pl-0">
      <AgentColumnBody className="flex-1">{children}</AgentColumnBody>
    </aside>
  );
}

export function AgentColumnSheet({ children }: { children?: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger
        className="flex h-7 items-center gap-1.5 rounded-md border border-input px-2 text-[11px] text-muted-foreground hover:text-foreground lg:hidden"
        title="Devin"
      >
        <Icon name="Bot" className="size-3.5" />
        Devin
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] gap-0 p-3 sm:max-w-sm">
        <SheetTitle className="sr-only">Devin</SheetTitle>
        <AgentColumnBody className="h-full">{children}</AgentColumnBody>
      </SheetContent>
    </Sheet>
  );
}

function AgentColumnBody({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Panel
      title="Devin"
      actions={<span className="text-[10px] text-muted-foreground">source: none</span>}
      className={cn("min-h-0", className)}
    >
      {children ?? (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-4 py-8 text-center">
          <Icon name="Bot" className="size-5 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">No runs yet</div>
        </div>
      )}
    </Panel>
  );
}
