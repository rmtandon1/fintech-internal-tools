import { caseFile, type CheckKind, type CheckResult } from "@console/tool-kyc";
import { formatTimestamp, titleCase } from "@console/ui/format";
import { StatusChip } from "@console/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@console/ui/table";
import { cn } from "@console/ui/utils";
import type { StatusTone } from "@console/engine/types";
import { Panel } from "@/components/panel";

const CHECK_LABEL: Record<CheckKind, string> = {
  sanctions: "Sanctions",
  pep: "PEP",
  adverse_media: "Adverse media",
  company_registry: "Company registry",
  identity_document: "Identity document",
};

const RESULT_TONE: Record<CheckResult, StatusTone> = {
  clear: "positive",
  verified: "positive",
  possible_match: "warning",
  findings: "warning",
  needs_review: "warning",
  missing: "warning",
  match: "negative",
  failed: "negative",
};

/**
 * The two panels under the customer card: what was checked and against which
 * source, then where the customer's declaration and the checks disagree.
 * `hold` carries the declared_vs_found reasons from the live policy preview;
 * material rows are drawn in the approval tone while the action is held.
 */
export function KycCaseFile({ caseId, hold }: { caseId: string; hold: string[] }) {
  const { checks, differences } = caseFile(caseId);
  return (
    <div className="space-y-5 px-5 pb-5 pt-4">
      <Panel title="Checks" className="mx-0 mb-0" bodyClassName="py-0.5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Ran</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => (
              <TableRow key={check.id}>
                <TableCell className="font-medium">{CHECK_LABEL[check.kind]}</TableCell>
                <TableCell>
                  <StatusChip
                    value={check.result}
                    statuses={[
                      {
                        value: check.result,
                        label: check.detail || titleCase(check.result),
                        tone: RESULT_TONE[check.result],
                      },
                    ]}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">{check.source}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatTimestamp(check.checkedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Declared vs found" className="mx-0 mb-0" bodyClassName="py-0.5">
        {differences.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            What the customer declared matches the checks.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Declared</TableHead>
                <TableHead>Found</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {differences.map((d) => {
                const held = hold.length > 0 && d.severity === "material";
                return (
                  <TableRow
                    key={d.id}
                    title={held ? hold.join(". ") : undefined}
                    className={cn(
                      held &&
                        "bg-yellow-100 ring-1 ring-yellow-300/70 dark:bg-yellow-400/15 dark:ring-yellow-400/30",
                    )}
                  >
                    <TableCell className="font-medium">{d.topic}</TableCell>
                    <TableCell>{d.declared}</TableCell>
                    <TableCell>{d.found}</TableCell>
                    <TableCell className="text-muted-foreground">{d.source}</TableCell>
                    <TableCell>
                      <StatusChip
                        value={d.severity}
                        statuses={[
                          {
                            value: d.severity,
                            label: titleCase(d.severity),
                            tone: d.severity === "material" ? "warning" : "neutral",
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
