import Link from "next/link";
import { Icon } from "@console/ui/icon";
import { RevealField } from "@/components/reveal-field";
import { maskRecord } from "@console/engine/pii/mask";
import type { Actor, LinkedActivity, ToolDeclaration } from "@console/engine/types";
import { formatFieldValue, humanize } from "@console/ui/format";
import { cn } from "@console/ui/utils";

/** Strip line: count, total, codes and the held marker; no PII. */
export function LinkedActivitySummaryLine({ activity }: { activity: LinkedActivity }) {
  const { summary } = activity;
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="tabular-nums text-foreground">{summary.count}</span> totalling
      <span className="tabular-nums text-foreground">{summary.total}</span>
      {summary.codes.length ? (
        <>
          <span aria-hidden>·</span>
          <span>{summary.codes.map(humanize).join(", ")}</span>
        </>
      ) : null}
      {summary.held > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1 text-amber-400">
            <Icon name="Flag" className="size-3" />
            <span className="tabular-nums">{summary.held}</span> waiting for approval
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Drawer body. Rows go through the linked tool's own masking, so the viewer
 * sees exactly what that tool would show them; the aggregate needs no masking.
 */
export function LinkedActivityBody({
  activity,
  linked,
  actor,
}: {
  activity: LinkedActivity;
  linked: ToolDeclaration | undefined;
  actor: Actor;
}) {
  const fields = linked
    ? activity.rowFields.flatMap((name) => {
        const field = linked.fields.find((f) => f.name === name);
        return field ? [field] : [];
      })
    : [];
  const rows = linked ? activity.rows : [];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{activity.title}</dt>
        <dd className="tabular-nums">
          {activity.summary.count}, totalling {activity.summary.total}
        </dd>
        <dt className="text-muted-foreground">Reasons</dt>
        <dd>{activity.summary.codes.map(humanize).join(", ") || "—"}</dd>
        <dt className="text-muted-foreground">Waiting for approval</dt>
        <dd className={cn("tabular-nums", activity.summary.held > 0 && "text-amber-400")}>
          {activity.summary.held > 0 ? activity.summary.held : "None"}
        </dd>
      </dl>

      {rows.length > 0 && linked ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-2 text-left font-medium">ID</th>
              {fields.map((field) => (
                <th
                  key={field.name}
                  className={cn(
                    "px-2 text-left font-medium",
                    (field.type === "currency" || field.type === "number") && "text-right",
                  )}
                >
                  {field.label}
                </th>
              ))}
              <th className="px-2 text-left font-medium">Status</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const masked = maskRecord(linked, row, actor);
              const held = activity.heldIds.includes(row.id);
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-2 font-mono">{row.id}</td>
                  {fields.map((field) => {
                    const numeric = field.type === "currency" || field.type === "number";
                    return (
                      <td
                        key={field.name}
                        className={cn(
                          "px-2",
                          numeric && "text-right tabular-nums",
                          field.name === "id" && "font-mono",
                        )}
                      >
                        {field.isPII ? (
                          <RevealField
                            tool={linked.name}
                            recordId={row.id}
                            field={field.name}
                            masked={String(masked.values[field.name] ?? "—")}
                            canReveal={masked.canReveal}
                          />
                        ) : (
                          formatFieldValue(field, masked.values)
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2">{humanize(String(row.status ?? "—"))}</td>
                  <td className="px-2 text-right">
                    {held ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-amber-400"
                        title="Awaiting approval"
                      >
                        <Icon name="Flag" className="size-3" /> waiting
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {activity.href ? (
        <Link
          href={activity.href}
          className="inline-flex items-center gap-1 text-xs text-foreground underline-offset-2 hover:underline"
        >
          Open these {activity.title.toLowerCase()}
          <Icon name="ArrowRight" className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
