import { previewActions } from "@console/engine/policy/preview";
import type { Actor, GovernedRecord, ToolDeclaration, ToggleDecl } from "@console/engine/types";
import { titleCase } from "@console/ui/format";
import { ToggleSwitch, type ToggleItem } from "@/components/toggle-switch";

/**
 * A queue shown as compact on/off switches, name and switch only. Each switch
 * offers the action that flips it, with the same availability the record
 * page shows; the flip itself goes through the write path like any action.
 */
export function ToggleGrid({
  decl,
  toggle,
  rows,
  actor,
}: {
  decl: ToolDeclaration;
  toggle: ToggleDecl;
  rows: GovernedRecord[];
  actor: Actor;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nothing matches these filters.
      </p>
    );
  }

  const groups = new Map<string, ToggleItem[]>();
  for (const row of rows) {
    const checked = Boolean(row[toggle.field]);
    const action = checked ? toggle.off : toggle.on;
    const preview = previewActions(decl, row, actor).find((p) => p.action === action);
    const group = toggle.groupBy ? String(row[toggle.groupBy] ?? "") : "";
    const items = groups.get(group) ?? [];
    items.push({
      recordId: row.id,
      name: String(row[decl.titleField] ?? row.id),
      href: `/t/${decl.name}/${row.id}`,
      checked,
      action,
      actionLabel: preview?.label ?? titleCase(action),
      available: preview?.offered ?? false,
      unavailableReason: preview?.unavailableReason,
      inputFields: preview?.inputFields ?? [],
    });
    groups.set(group, items);
  }

  const groupField = decl.fields.find((f) => f.name === toggle.groupBy);
  const order = groupField?.enumValues ?? [];
  const sections = [...groups.entries()].sort(
    ([a], [b]) => rank(order, a) - rank(order, b) || a.localeCompare(b),
  );

  return (
    <div className="space-y-5 p-4">
      {sections.map(([group, items]) => (
        <section key={group} className="space-y-2">
          {group ? (
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              {titleCase(group)}
              <span className="tabular-nums font-normal text-muted-foreground">{items.length}</span>
            </h3>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <ToggleSwitch key={item.recordId} tool={decl.name} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Declared enum order first (production before staging), unknown values last. */
function rank(order: readonly string[], value: string): number {
  const index = order.indexOf(value);
  return index < 0 ? order.length : -index;
}
