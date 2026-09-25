import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@console/ui/icon";
import { Panel } from "@/components/panel";
import { RecordView } from "@/components/record-view";
import { StatusChip } from "@console/ui/status-chip";
import { currentActor } from "@/lib/session";
import { getTool } from "@/registry";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ tool: string; id: string }>;
}) {
  const { tool, id } = await params;
  const decl = getTool(tool);
  const actor = await currentActor();
  if (!decl || !decl.visibleTo.includes(actor.role)) notFound();

  const record = decl.get(id);
  if (!record) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href={`/t/${decl.name}`} className="hover:text-foreground">
          {decl.displayName}
        </Link>
        <Icon name="ChevronRight" className="size-3" />
        <span className="font-mono">{record.id}</span>
      </div>

      <Panel
        className="min-h-0 flex-1"
        title={
          <span className="flex items-center gap-2 normal-case tracking-normal">
            <span className="font-mono text-foreground">{record.id}</span>
            <span aria-hidden>·</span>
            <StatusChip
              value={String(record[decl.statusField])}
              statuses={decl.statuses}
            />
            <span aria-hidden>·</span>
            <span className="tabular-nums text-muted-foreground">
              v{record.version}
            </span>
          </span>
        }
      >
        <RecordView decl={decl} record={record} actor={actor} />
      </Panel>
    </div>
  );
}
