import { AuditTimeline } from "@/components/audit-timeline";
import { Panel } from "@/components/panel";
import { listAuditEvents } from "@console/engine/audit/query";
import { currentActor } from "@/lib/session";
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

  const { rows, total } = listAuditEvents({
    tool: pick("tool"),
    event: pick("event"),
    actorId: pick("actorId"),
    recordId: pick("recordId"),
    limit: 100,
  });

  return (
    <Panel
      className="h-full"
      title={
        <span>
          Audit stream · <span className="tabular-nums">{total}</span>
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
            className="h-6 rounded-md border border-input bg-transparent px-1.5 text-[11px] text-foreground"
          >
            <option value="all">Tool</option>
            {TOOLS.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.displayName}
              </option>
            ))}
          </select>
          <select
            name="event"
            defaultValue={pick("event") ?? "all"}
            className="h-6 rounded-md border border-input bg-transparent px-1.5 text-[11px] text-foreground"
          >
            {[
              "all",
              "applied",
              "applied_after_approval",
              "denied",
              "approval_requested",
              "approval_granted",
              "approval_rejected",
              "approval_failed",
              "pii_revealed",
              "constant_changed",
            ].map((event) => (
              <option key={event} value={event}>
                {event}
              </option>
            ))}
          </select>
          <input
            name="actorId"
            defaultValue={pick("actorId") ?? ""}
            placeholder="Actor"
            className="h-6 w-24 rounded-md border border-input bg-transparent px-1.5 text-[11px] text-foreground"
          />
          <button
            type="submit"
            className="h-6 rounded-md border border-input px-2 text-[11px] hover:bg-accent"
          >
            Apply
          </button>
        </form>
      }
      bodyClassName="p-3"
    >
      <AuditTimeline events={rows} />
    </Panel>
  );
}
