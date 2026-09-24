import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/approval-card";
import { Panel } from "@/components/panel";
import { canDecide, listApprovals } from "@/engine/approvals";
import { currentActor } from "@/lib/session";

export default async function InboxPage() {
  const actor = await currentActor();
  if (actor.role === "analyst") notFound();

  const pending = listApprovals("pending");
  const decided = listApprovals().filter((a) => a.status !== "pending").slice(0, 20);

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-2">
      <Panel
        title={
          <span>
            Pending · <span className="tabular-nums">{pending.length}</span>
          </span>
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
