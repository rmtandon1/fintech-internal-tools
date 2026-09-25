"use client";

import { TableCell, TableRow } from "@console/ui/table";
import { Button } from "@console/ui/button";
import { useWorkspace } from "@/components/workspace";
import type { HandoffOffer } from "@/lib/handoff";

/** A /runs row: clicking focuses the run in the agent column. */
export function RunRow({
  runId,
  cells,
  reversalOffer,
}: {
  runId: string;
  cells: React.ReactNode[];
  /** Built server-side when this merged IMPLEMENTATION may be reversed. */
  reversalOffer: HandoffOffer | null;
}) {
  const { setAgentFocus } = useWorkspace();
  return (
    <TableRow
      className="cursor-pointer hover:bg-accent/40"
      onClick={() => setAgentFocus({ kind: "run", runId })}
    >
      {cells.map((cell, i) => (
        <TableCell key={i}>{cell}</TableCell>
      ))}
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
            Reverse this change
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
