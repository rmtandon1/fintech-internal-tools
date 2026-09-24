import { notFound } from "next/navigation";
import { ApprovalCard } from "@/components/approval-card";
import { canDecide, listApprovals } from "@/engine/approvals";
import { canApprove } from "@/lib/roles";
import { currentActor } from "@/lib/session";

export default async function InboxPage() {
  const actor = await currentActor();
  if (!canApprove(actor.role)) notFound();

  const pending = listApprovals("pending");
  const decided = listApprovals().filter((a) => a.status !== "pending").slice(0, 20);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Each request carries the payload, policy trace and record version frozen at the
          moment it was raised. Approving executes exactly that.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
        ) : (
          pending.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              gate={canDecide(approval, actor)}
            />
          ))
        )}
      </section>

      {decided.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recently decided
          </h2>
          {decided.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              gate={{ ok: false, reason: `${approval.status}` }}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
