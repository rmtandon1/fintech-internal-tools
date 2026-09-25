import { StatusChip } from "@console/ui/status-chip";
import { maskRecord } from "@console/engine/pii/mask";
import type { ColumnDecl, GovernedRecord, ToolDeclaration } from "@console/engine/types";
import { formatFieldValue } from "@console/ui/format";

/** List-cell rendering for a tool's queue table. */
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
