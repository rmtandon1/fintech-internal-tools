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
import { formatRelative, titleCase } from "@console/ui/format";

type Gate = { ok: true } | { ok: false; reason: string };

export function ApprovalCard({
  approval,
  gate,
}: {
  approval: ApprovalView;
  gate: Gate;
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
        toast.success(result.outcome.summary);
      } else if (result.outcome.status === "error") {
        toast.error(titleCase(result.outcome.code), { description: result.outcome.message });
      } else {
        toast.info(result.outcome.status);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">{approval.summary}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {approval.reason} · raised by {approval.requesterId} ·{" "}
              {formatRelative(approval.createdAt)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {approval.tool}.{approval.action}
            </Badge>
            <Badge
              variant={approval.status === "pending" ? "secondary" : "outline"}
              className="text-[10px] capitalize"
            >
              {approval.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Frozen payload
            </div>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px]">
              {JSON.stringify(approval.payload, null, 2)}
            </pre>
            {approval.recordId ? (
              <Link
                href={`/t/${approval.tool}/${approval.recordId}`}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {approval.recordId} · version {approval.recordVersion}
              </Link>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Policy trace at request time
            </div>
            <div className="rounded-md border border-border p-2">
              <PolicyTraceList trace={approval.trace} />
            </div>
          </div>
        </div>

        {approval.status === "pending" ? (
          gate.ok ? (
            <div className="space-y-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Decision note"
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => decide("approve")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => decide("reject")}
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-400">{gate.reason}</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            {titleCase(approval.status)} by {approval.decidedBy ?? "—"}
            {approval.decisionNote ? ` · ${approval.decisionNote}` : ""}
            {approval.failureCode ? ` · ${approval.failureCode}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
