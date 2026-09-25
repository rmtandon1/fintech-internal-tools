import { AuditTimeline } from "@/components/audit-timeline";
import { Panel } from "@/components/panel";
import { listAuditEvents } from "@console/engine/audit/query";
import { currentActor } from "@/lib/session";
import { AUDIT_EVENT_LABELS } from "@/lib/audit-events";
import { TOOLS } from "@/registry";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const actor = await currentActor();
  void actor;
  const pick = (key: string) =>
    typeof query[key] === "string" && query[key] !== "" && query[key] !== "all"
      ? (query[key] as string)
      : undefined;

  const sinceHours = Number(pick("since"));
  const since =
    Number.isFinite(sinceHours) && sinceHours > 0
      ? Date.now() - sinceHours * 60 * 60 * 1000
      : undefined;

  const { rows, total } = listAuditEvents({
    tool: pick("tool"),
    event: pick("event"),
    actorId: pick("actorId"),
    recordId: pick("recordId"),
    since,
    limit: 100,
  });

  return (
    <Panel
      className="h-full"
      title={
        <span>
          Audit log{since !== undefined ? ` · last ${sinceHours} hours` : ""} ·{" "}
          <span className="tabular-nums">{total}</span>
          {pick("recordId") ? (
            <span className="font-mono normal-case tracking-normal"> · {pick("recordId")}</span>
          ) : null}
        </span>
      }
      actions={
        <form className="flex items-center gap-2">
          {pick("recordId") ? (
            <input type="hidden" name="recordId" value={pick("recordId")} />
          ) : null}
          <select
            name="tool"
            defaultValue={pick("tool") ?? "all"}
            className="h-8 rounded-md border border-input bg-transparent px-1.5 text-sm text-foreground"
          >
            <option value="all">Any tool</option>
            {TOOLS.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.displayName}
              </option>
            ))}
          </select>
          <select
            name="event"
            defaultValue={pick("event") ?? "all"}
            className="h-8 rounded-md border border-input bg-transparent px-1.5 text-sm text-foreground"
          >
            <option value="all">Any event</option>
            {Object.entries(AUDIT_EVENT_LABELS).map(([event, label]) => (
              <option key={event} value={event}>
                {label}
              </option>
            ))}
          </select>
          {since !== undefined ? (
            <input type="hidden" name="since" value={String(sinceHours)} />
          ) : null}
          <input
            name="actorId"
            defaultValue={pick("actorId") ?? ""}
            placeholder="Person"
            className="h-8 w-32 rounded-md border border-input bg-transparent px-1.5 text-sm text-foreground"
          />
          <button
            type="submit"
            className="h-8 rounded-md border border-input px-2 text-sm hover:bg-accent"
          >
            Filter
          </button>
        </form>
      }
      bodyClassName="p-3"
    >
      <AuditTimeline events={rows} />
    </Panel>
  );
}
