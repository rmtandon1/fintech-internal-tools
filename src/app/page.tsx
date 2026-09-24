import Link from "next/link";
import { Icon } from "@/components/icon";
import { Panel } from "@/components/panel";
import { RecordTable } from "@/components/record-table";
import { RecordView } from "@/components/record-view";
import { StatusChip } from "@/components/status-chip";
import { currentActor } from "@/lib/session";
import { cn } from "@/lib/utils";
import { workSummary } from "@/lib/work";
import { toolsForRole } from "@/tools";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await currentActor();
  const query = await searchParams;
  const now = Date.now();

  const tools = toolsForRole(actor.role);
  const summaries = tools.map((decl) => ({ decl, summary: workSummary(decl, actor, now) }));

  const selected =
    typeof query.tool === "string"
      ? summaries.find((s) => s.decl.name === query.tool)
      : undefined;
  const current = selected ?? summaries[0];
  const rows = current ? current.summary.rows.slice(0, 50) : [];
  const top = rows[0] ?? null;

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="Work" bodyClassName="overflow-auto">
        <div>
          {summaries.map(({ decl, summary }) => {
            const active = decl.name === current?.decl.name;
            return (
              <Link
                key={decl.name}
                href={`/?tool=${decl.name}`}
                className={cn(
                  "flex h-8 items-center gap-2 px-3 text-xs",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/40",
                )}
              >
                <Icon name={decl.icon} className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{decl.displayName}</span>
                {summary.attention > 0 ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-400">
                    <Icon name="Flag" className="size-3" />
                    <span className="tabular-nums">{summary.attention}</span>{" "}
                    {summary.attentionLabel}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "tabular-nums text-muted-foreground",
                    summary.attention === 0 && "ml-auto",
                  )}
                >
                  {summary.open}
                </span>
              </Link>
            );
          })}
        </div>
        {current ? (
          <>
            <div className="border-t border-border" />
            <RecordTable decl={current.decl} rows={rows} actor={actor} now={now} />
          </>
        ) : null}
      </Panel>

      <Panel
        title={
          current && top ? (
            <span className="flex items-center gap-2 normal-case tracking-normal">
              <span className="font-mono text-foreground">{top.id}</span>
              <span aria-hidden>·</span>
              <StatusChip
                value={String(top[current.decl.statusField])}
                statuses={current.decl.statuses}
              />
              <span aria-hidden>·</span>
              <span className="tabular-nums text-muted-foreground">
                v{top.version}
              </span>
            </span>
          ) : (
            "Record"
          )
        }
      >
        {current && top ? (
          <RecordView decl={current.decl} record={top} actor={actor} />
        ) : (
          <p className="p-3 text-xs text-muted-foreground">No open records.</p>
        )}
      </Panel>
    </div>
  );
}
