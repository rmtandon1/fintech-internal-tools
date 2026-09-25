import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/approval-card";
import { Panel } from "@/components/panel";
import { canDecide, listApprovals } from "@console/engine/approvals";
import { canApprove } from "@console/permissions";
import { currentActor } from "@/lib/session";
import { getTool } from "@/registry";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const actor = await currentActor();
  if (!canApprove(actor.role)) notFound();

  const tool = typeof query.tool === "string" ? getTool(query.tool) : undefined;
  const inScope = tool ? listApprovals().filter((a) => a.tool === tool.name) : listApprovals();
  const pending = inScope.filter((a) => a.status === "pending");
  const decided = inScope.filter((a) => a.status !== "pending").slice(0, 20);

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-2">
      <Panel
        title={
          <span>
            Pending{tool ? ` · ${tool.displayName}` : ""} ·{" "}
            <span className="tabular-nums">{pending.length}</span>
          </span>
        }
        actions={
          tool ? (
            <Link
              href="/inbox"
              className="h-6 rounded-md border border-input px-2 leading-6 text-[11px] hover:bg-accent"
            >
              All tools
            </Link>
          ) : null
        }
        bodyClassName="space-y-3 p-3"
      >
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing waiting on you.</p>
        ) : (
          pending.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              gate={canDecide(approval, actor)}
            />
          ))
        )}
      </Panel>

      <Panel
        title={
          <span>
            Recently decided · <span className="tabular-nums">{decided.length}</span>
          </span>
        }
        bodyClassName="space-y-3 p-3"
      >
        {decided.length === 0 ? (
          <p className="text-xs text-muted-foreground">No decisions yet.</p>
        ) : (
          decided.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              gate={{ ok: false, reason: `${approval.status}` }}
            />
          ))
        )}
      </Panel>
    </div>
  );
}
