"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { TableCell, TableRow } from "@console/ui/table";
import { Button } from "@console/ui/button";
import { StatusChip } from "@console/ui/status-chip";
import { formatRelative } from "@console/ui/format";
import { useWorkspace } from "@/components/workspace";
import type { HandoffOffer } from "@/lib/handoff";
import { runKindLabel } from "@console/tool-automation";
import { roleLabel, ROLES, type Role } from "@console/permissions";

const ROLE_NAMES: readonly string[] = ROLES;

function isRole(value: string): value is Role {
  return ROLE_NAMES.includes(value);
}

/** The /runs row's fields, plain data so they cross the server boundary. */
export interface RunRowData {
  id: string;
  kind: string;
  intent: string;
  requestedByRole: string;
  status: string;
  prUrl: string | null;
  reverses: string | null;
  requestedAt: number;
}

/** A /runs row: clicking focuses the run in the agent column. */
export function RunRow({
  run,
  statuses,
  reversalOffer,
}: {
  run: RunRowData;
  statuses: ComponentProps<typeof StatusChip>["statuses"];
  /** Built server-side when this merged IMPLEMENTATION may be reversed. */
  reversalOffer: HandoffOffer | null;
}) {
  const { setAgentFocus } = useWorkspace();
  const prNumber = run.prUrl?.match(/pull\/(\d+)/)?.[1];
  return (
    <TableRow
      className="cursor-pointer hover:bg-accent/40"
      onClick={() => setAgentFocus({ kind: "run", runId: run.id })}
    >
      <TableCell>
        <span className="whitespace-nowrap text-xs">{runKindLabel(run.kind)}</span>
      </TableCell>
      <TableCell>
        <span className="block max-w-64 truncate">{run.intent}</span>
      </TableCell>
      <TableCell>
        {isRole(run.requestedByRole) ? roleLabel(run.requestedByRole) : run.requestedByRole}
      </TableCell>
      <TableCell>
        <StatusChip value={run.status} statuses={statuses} />
      </TableCell>
      <TableCell>
        {run.prUrl ? (
          <a
            href={run.prUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[11px] hover:underline"
          >
            #{prNumber ?? "pr"}
          </a>
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
        <span className="text-muted-foreground">{formatRelative(run.requestedAt)}</span>
      </TableCell>
      <TableCell>
        {reversalOffer ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-6 text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              setAgentFocus({ kind: "handoff", offer: reversalOffer });
            }}
            data-testid="reverse-run"
          >
            Undo this change
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
