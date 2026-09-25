import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApprovalCard, type ApprovalLabels } from "@/components/approval-card";
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
  const approver = canApprove(actor.role);
  const tool = typeof query.tool === "string" ? getTool(query.tool) : undefined;
  if (typeof query.tool === "string" && !tool) notFound();
  if (tool && !tool.visibleTo.includes(actor.role)) redirect("/");
  if (!approver && !tool) redirect("/");

  const inScope = listApprovals().filter(
    (a) => (!tool || a.tool === tool.name) && (approver || a.requesterId === actor.id),
  );
  const pending = inScope.filter(
    (a) => a.status === "pending" && (!tool || !approver || canDecide(a, actor).ok),
  );
  const decided = inScope.filter((a) => a.status !== "pending").slice(0, 20);

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-2">
      <Panel
        title={
          <span>
            {approver ? "Waiting for your approval" : "Your requests waiting for approval"}
            {tool ? ` · ${tool.displayName}` : ""} ·{" "}
            <span className="tabular-nums">{pending.length}</span>
          </span>
        }
        actions={
          tool && approver ? (
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
          <p className="text-sm text-muted-foreground">Nothing needs your approval right now.</p>
        ) : (
          pending.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              gate={canDecide(approval, actor)}
              labels={labelsFor(approval.tool, approval.action)}
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
          <p className="text-sm text-muted-foreground">No decisions yet.</p>
        ) : (
          decided.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              gate={{ ok: false, reason: `${approval.status}` }}
              labels={labelsFor(approval.tool, approval.action)}
            />
          ))
        )}
      </Panel>
    </div>
  );
}

/** Display names the card needs, read from the tool declaration on the server. */
function labelsFor(toolName: string, actionName: string): ApprovalLabels {
  const decl = getTool(toolName);
  return {
    tool: decl?.displayName ?? toolName,
    action: decl?.actions.find((a) => a.name === actionName)?.label ?? actionName,
    rules: decl?.ruleLabels,
  };
}
