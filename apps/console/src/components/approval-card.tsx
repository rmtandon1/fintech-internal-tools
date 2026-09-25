"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { approveRequest, rejectRequest } from "@/app/actions";
import { PolicyTraceList } from "@console/ui/policy-trace";
import { Badge } from "@console/ui/badge";
import { Button } from "@console/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@console/ui/card";
import { Textarea } from "@console/ui/textarea";
import type { ApprovalView } from "@console/engine/approvals";
import { formatRelative, humanize } from "@console/ui/format";

type Gate = { ok: true } | { ok: false; reason: string };

/** Names from the tool declaration, resolved on the server. */
export interface ApprovalLabels {
  tool: string;
  action: string;
  rules?: Record<string, string>;
}

const STATUS_LABEL: Record<ApprovalView["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Could not be applied",
};

export function ApprovalCard({
  approval,
  gate,
  labels,
}: {
  approval: ApprovalView;
  gate: Gate;
  labels: ApprovalLabels;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(kind: "approve" | "reject") {
    startTransition(async () => {
      const result =
        kind === "approve"
          ? await approveRequest(approval.id, note)
          : await rejectRequest(approval.id, note || "No reason given");
      if (result.outcome.status === "applied") {
        toast.success(kind === "approve" ? "Approved" : "Rejected", {
          description: result.outcome.summary,
        });
      } else if (result.outcome.status === "error") {
        toast.error("Nothing was changed", { description: result.outcome.message });
      } else {
        toast.info(humanize(result.outcome.status));
      }
    });
  }

  const inputs = payloadEntries(approval.payload);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{approval.summary}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Asked by {approval.requesterId} · {formatRelative(approval.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {labels.tool} · {labels.action}
            </Badge>
            <Badge
              variant={approval.status === "pending" ? "secondary" : "outline"}
              className="text-xs"
            >
              {STATUS_LABEL[approval.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Why it needs approval</div>
            <div className="rounded-md border border-border">
              <PolicyTraceList
                trace={approval.trace.filter((o) => o.type !== "allow")}
                labels={labels.rules}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">What was asked</div>
            {inputs.length > 0 ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {inputs.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{humanize(key)}</dt>
                    <dd className="break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No extra details.</p>
            )}
            {approval.recordId ? (
              <Link
                href={`/t/${approval.tool}/${approval.recordId}`}
                className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Open {approval.recordId}
              </Link>
            ) : null}
          </div>
        </div>

        {approval.status === "pending" ? (
          gate.ok ? (
            <div className="space-y-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Note (optional)"
              />
              <div className="flex gap-2">
                <Button disabled={pending} onClick={() => decide("approve")}>
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => decide("reject")}
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-400">{gate.reason}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            {STATUS_LABEL[approval.status]} by {approval.decidedBy ?? "—"}
            {approval.decisionNote ? `: ${approval.decisionNote}` : ""}
            {approval.failureCode ? ` (${humanize(approval.failureCode)})` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** The request's own inputs as label/value pairs; blank values are left out. */
function payloadEntries(payload: unknown): [string, string][] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload as Record<string, unknown>).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === "") return [];
    const text =
      typeof value === "boolean" ? (value ? "Yes" : "No") : typeof value === "object" ? JSON.stringify(value) : String(value);
    return [[key, text]];
  });
}
