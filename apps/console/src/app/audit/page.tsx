import Link from "next/link";
import { AuditTimeline } from "@/components/audit-timeline";
import { Card, CardContent } from "@console/ui/card";
import { listAuditEvents } from "@console/engine/audit/query";
import { verifyChain } from "@console/engine/audit/verify";
import { currentActor } from "@/lib/session";
import { TOOLS } from "@/registry";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const actor = await currentActor();
  const pick = (key: string) =>
    typeof query[key] === "string" && query[key] !== "" && query[key] !== "all"
      ? (query[key] as string)
      : undefined;

  const { rows, total } = listAuditEvents({
    tool: pick("tool"),
    event: pick("event"),
    actorId: pick("actorId"),
    limit: 100,
  });
  const chain = verifyChain();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-lg font-semibold">Audit stream</h1>
          <p className="text-sm text-muted-foreground">
            Append-only, hash-chained. {total} events recorded.
          </p>
        </div>
        {actor.role === "admin" ? (
          <Link
            href="/audit/verify"
            className="ml-auto rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            {chain.ok ? "Chain intact" : "Chain broken"} — verify
          </Link>
        ) : null}
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <Field label="Tool">
          <select
            name="tool"
            defaultValue={pick("tool") ?? "all"}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          >
            <option value="all">All</option>
            {TOOLS.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Event">
          <select
            name="event"
            defaultValue={pick("event") ?? "all"}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
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
        </Field>
        <Field label="Actor">
          <input
            name="actorId"
            defaultValue={pick("actorId") ?? ""}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          />
        </Field>
        <button
          type="submit"
          className="h-8 rounded-md border border-input px-3 text-xs hover:bg-accent"
        >
          Apply
        </button>
      </form>

      <Card>
        <CardContent className="py-4">
          <AuditTimeline events={rows} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span className="block">{label}</span>
      {children}
    </label>
  );
}
