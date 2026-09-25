import { StatusChip } from "@console/ui/status-chip";
import { maskRecord } from "@console/engine/pii/mask";
import type { ColumnDecl, GovernedRecord, ToolDeclaration } from "@console/engine/types";
import { formatFieldValue } from "@console/ui/format";
import { TONE_INK, bandFor } from "@console/ui/gauge";
import { kycTool } from "@console/tool-kyc";
import { riskBands } from "@/lib/customer-profile";
import { kycThresholds } from "@/lib/kyc-thresholds";

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
  const score = row[column.field];
  if (decl.name === kycTool.name && column.field === "riskScore" && typeof score === "number") {
    return <RiskScoreCell score={score} />;
  }
  if (field) return <>{formatFieldValue(field, masked.values)}</>;
  return <>{String(masked.values[column.field] ?? "—")}</>;
}

/** The score with a short bar in its gauge band's colour. */
function RiskScoreCell({ score }: { score: number }) {
  const band = bandFor(riskBands(kycThresholds()), score);
  const ink = band ? TONE_INK[band.tone] : undefined;
  return (
    <span className="inline-flex items-center justify-end gap-2" title={band?.label}>
      <span className="tabular-nums">{score}</span>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, background: ink }}
        />
      </span>
    </span>
  );
}

export function columnIsNumeric(decl: ToolDeclaration, column: ColumnDecl): boolean {
  const field = decl.fields.find((f) => f.name === column.field);
  return (
    column.align === "right" || field?.type === "number" || field?.type === "currency"
  );
}
