import Link from "next/link";
import { Icon } from "@/components/icon";
import { StatusChip } from "@/components/status-chip";
import { maskRecord } from "@/engine/pii/mask";
import type {
  Actor,
  ColumnDecl,
  GovernedRecord,
  ToolDeclaration,
} from "@/engine/types";
import { formatFieldValue } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Shared list-cell rendering for the queue page and the home Work table. */
export function RecordCell({
  decl,
  column,
  row,
  masked,
}: {
  decl: ToolDeclaration;
  column: ColumnDecl;
  row: GovernedRecord;
  masked: ReturnType<typeof maskRecord>;
}) {
  const field = decl.fields.find((f) => f.name === column.field);
  if (column.field === decl.statusField) {
    return (
      <StatusChip value={String(row[decl.statusField])} statuses={decl.statuses} />
    );
  }
  if (field) return <>{formatFieldValue(field, masked.values)}</>;
  return <>{String(masked.values[column.field] ?? "—")}</>;
}

export function columnIsNumeric(decl: ToolDeclaration, column: ColumnDecl): boolean {
  const field = decl.fields.find((f) => f.name === column.field);
  return (
    column.align === "right" || field?.type === "number" || field?.type === "currency"
  );
}

/** A dense record table: first `columnCount` listColumns, mono ids, h-7 rows. */
export function RecordTable({
  decl,
  rows,
  actor,
  now,
  columnCount = 4,
}: {
  decl: ToolDeclaration;
  rows: GovernedRecord[];
  actor: Actor;
  now: number;
  columnCount?: number;
}) {
  const columns = decl.listColumns.slice(0, columnCount);
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((row) => {
          const masked = maskRecord(decl, row, actor);
          const marker = decl.attention?.(row, now) ?? null;
          return (
            <tr key={row.id} className="h-7 border-b border-border hover:bg-accent/40">
              {columns.map((column, index) => (
                <td
                  key={column.field}
                  className={cn(
                    "whitespace-nowrap px-2 align-middle",
                    columnIsNumeric(decl, column) && "text-right tabular-nums",
                  )}
                >
                  {index === 0 ? (
                    <Link
                      href={`/t/${decl.name}/${row.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      <RecordCell decl={decl} column={column} row={row} masked={masked} />
                    </Link>
                  ) : (
                    <RecordCell decl={decl} column={column} row={row} masked={masked} />
                  )}
                </td>
              ))}
              <td className="w-8 px-2 text-right align-middle">
                {marker ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                    <Icon name="Flag" className="size-3" />
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length + 1}
              className="px-3 py-6 text-center text-xs text-muted-foreground"
            >
              No open records.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
