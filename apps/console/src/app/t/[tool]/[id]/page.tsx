import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@console/ui/icon";
import { ContextDrawer } from "@/components/context-drawer";
import {
  LinkedActivityBody,
  LinkedActivitySummaryLine,
} from "@/components/linked-activity";
import { Panel } from "@/components/panel";
import { RecordView } from "@/components/record-view";
import { RunView } from "@/components/run-view";
import { StatusChip } from "@console/ui/status-chip";
import { automationTool, getRun } from "@console/tool-automation";
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
  if (!decl) notFound();
  if (!decl.visibleTo.includes(actor.role)) redirect("/");

  const record = decl.get(id);
  if (!record) notFound();

  const activity = decl.linkedActivity?.(record, actor) ?? null;
  const linked = activity ? getTool(activity.tool) : undefined;
  const run = decl.name === automationTool.name ? getRun(id) : null;

  const panel = (
    <Panel
      className="min-h-0 flex-1"
      title={
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <span className="text-sm font-semibold text-foreground">
            {String(record[decl.titleField] ?? record.id)}
          </span>
          <StatusChip
            value={String(record[decl.statusField])}
            statuses={decl.statuses}
          />
        </span>
      }
    >
      <RecordView
        decl={decl}
        record={record}
        actor={actor}
        actions={
          run ? (
            <span className="text-[11px] text-muted-foreground">
              Devin&apos;s controls are in the run view above
            </span>
          ) : undefined
        }
        extra={run ? <RunView key={id} runId={id} showSummary /> : undefined}
      />
    </Panel>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/t/${decl.name}`} className="hover:text-foreground">
          {decl.displayName}
        </Link>
        <Icon name="ChevronRight" className="size-3" />
        <span>{String(record[decl.titleField] ?? record.id)}</span>
      </div>

      {activity ? (
        <ContextDrawer
          title={`${activity.title} from this customer`}
          summary={<LinkedActivitySummaryLine activity={activity} />}
          content={
            <LinkedActivityBody activity={activity} linked={linked} actor={actor} />
          }
        >
          {panel}
        </ContextDrawer>
      ) : (
        panel
      )}
    </div>
  );
}
