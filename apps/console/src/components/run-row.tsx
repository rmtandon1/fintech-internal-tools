"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { TableCell, TableRow } from "@console/ui/table";
import { StatusChip } from "@console/ui/status-chip";
import { formatTimestamp } from "@console/ui/format";
import { PrButton } from "@/components/pr-button";
import { RemoveRuleButton } from "@/components/remove-rule-dialog";
import { useWorkspace } from "@/components/workspace";

/** The /runs row's fields, plain data so they cross the server boundary. */
export interface RunRowData {
  id: string;
  operation: string;
  operationLabel: string;
  intent: string;
  requestedByRole: string;
  requesterLabel: string;
  status: string;
  prUrl: string | null;
  prNumber: number | null;
  /** The rule the run's spec adds, e.g. "Refund hold"; null for specs without one. */
  ruleName: string | null;
  reverses: string | null;
  requestedAt: number;
}

/** A /runs row: clicking focuses the run in the agent column. */
export function RunRow({
  run,
  statuses,
  removable,
  devinConnected,
}: {
  run: RunRowData;
  statuses: ComponentProps<typeof StatusChip>["statuses"];
  /** Whether the viewer may ask Devin to remove this merged change. */
  removable: boolean;
  /** Whether a handoff can be sent right now (`DEVIN_API_KEY` set). */
  devinConnected: boolean;
}) {
  const { setAgentFocus } = useWorkspace();
  return (
    <TableRow
      className="cursor-pointer hover:bg-accent/40"
      onClick={() => setAgentFocus({ kind: "run", runId: run.id })}
    >
      <TableCell>
        <span className="whitespace-nowrap text-xs">{run.operationLabel}</span>
      </TableCell>
      <TableCell>
        <span className="block max-w-64 truncate">{run.intent}</span>
      </TableCell>
      <TableCell>
        {run.requesterLabel}
      </TableCell>
      <TableCell>
        <StatusChip value={run.status} statuses={statuses} />
      </TableCell>
      <TableCell>
        {run.prUrl ? (
          <PrButton url={run.prUrl} number={run.prNumber} onClick={(e) => e.stopPropagation()} />
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        {run.reverses ? (
          <Link
            href={`/t/automation/${run.reverses}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[11px] hover:underline"
          >
            {run.reverses.slice(-6)}
          </Link>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">{formatTimestamp(run.requestedAt)}</span>
      </TableCell>
      <TableCell>
        {removable ? (
          <span onClick={(e) => e.stopPropagation()}>
            <RemoveRuleButton
              runId={run.id}
              rule={
                run.ruleName
                  ? { name: run.ruleName, prNumber: run.prNumber, prUrl: run.prUrl, askedAt: run.requestedAt, on: null }
                  : null
              }
              size="sm"
              variant="secondary"
              className="h-6 text-[11px]"
              disabled={!devinConnected}
              title={devinConnected ? undefined : "Set DEVIN_API_KEY to connect Devin"}
            >
              Remove this rule
            </RemoveRuleButton>
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
