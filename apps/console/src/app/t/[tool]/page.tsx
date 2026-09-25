import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@console/ui/icon";
import { Panel } from "@/components/panel";
import { RecordCell, columnIsNumeric } from "@/components/record-table";
import { StatStrip } from "@/components/stat-strip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@console/ui/table";
import { maskRecord } from "@console/engine/pii/mask";
import { previewActions } from "@console/engine/policy/preview";
import type { Actor, ClusterDecl, ClusterGroup, ToolDeclaration } from "@console/engine/types";
import { ClusterDrawer, type ClusterRow } from "@/components/cluster-drawer";
import type { DispatchOffer } from "@/components/dispatch-control";
import { ReconcileRuns } from "@/components/reconcile-runs";
import { getSpec, kindsStartableBy } from "@console/tool-automation";
import { devinMode } from "@/lib/devin-status";
import { currentActor } from "@/lib/session";
import { simulationsFor } from "@/lib/simulation";
import { cn } from "@console/ui/utils";
import { getTool } from "@/registry";

const PAGE_SIZE = 50;

export default async function ToolQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tool } = await params;
  const query = await searchParams;
  const decl = getTool(tool);
  const actor = await currentActor();
  if (!decl) notFound();
  if (!decl.visibleTo.includes(actor.role)) redirect("/");

  const filters: Record<string, string> = {};
  for (const filter of decl.filters) {
    const value = query[filter.field];
    if (typeof value === "string" && value !== "" && value !== "all") {
      filters[filter.field] = value;
    }
  }
  const search = typeof query.q === "string" ? query.q : undefined;
  const sortable = decl.listColumns.filter((column) => column.sortable);
  const sortField =
    typeof query.sort === "string" &&
    sortable.some((column) => column.field === query.sort)
      ? query.sort
      : undefined;
  const direction: "asc" | "desc" = query.dir === "asc" ? "asc" : "desc";
  const sort = sortField ? { field: sortField, direction } : undefined;

  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;

  const first = decl.list({ filters, search, sort, limit: PAGE_SIZE, offset: 0 });
  const pages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const { rows, total } =
    current === 1
      ? first
      : decl.list({
          filters,
          search,
          sort,
          limit: PAGE_SIZE,
          offset: (current - 1) * PAGE_SIZE,
        });

  const href = (overrides: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) next.set(key, value);
    if (search) next.set("q", search);
    if (sortField) {
      next.set("sort", sortField);
      next.set("dir", direction);
    }
    for (const [key, value] of Object.entries(overrides)) next.set(key, value);
    return `/t/${decl.name}?${next.toString()}`;
  };

  const clusters = (decl.clusters ?? [])
    .map((cluster) => ({ cluster, groups: cluster.groups() }))
    .filter(({ groups }) => groups.length > 0);
  const inspect = typeof query.inspect === "string" ? query.inspect : undefined;
  const open = inspect ? resolveGroup(clusters, inspect) : undefined;

  const sortHref = (field: string) =>
    href({
      sort: field,
      dir: sortField === field && direction === "desc" ? "asc" : "desc",
      page: "1",
    });

  const filterRow = (
    <form
      key={new URLSearchParams({ ...filters, q: search ?? "" }).toString()}
      className="flex items-center gap-2"
    >
      {decl.filters.map((filter) =>
        filter.type === "enum" ? (
          <select
            key={filter.field}
            name={filter.field}
            defaultValue={filters[filter.field] ?? "all"}
            title={filter.label}
            className="h-6 rounded-md border border-input bg-transparent px-1.5 text-[11px] text-foreground"
          >
            <option value="all">{filter.label}</option>
            {filter.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={filter.field}
            name={filter.field}
            defaultValue={filters[filter.field] ?? ""}
            placeholder={filter.label}
            className="h-6 w-24 rounded-md border border-input bg-transparent px-1.5 text-[11px] text-foreground"
          />
        ),
      )}
      {sortField ? <input type="hidden" name="sort" value={sortField} /> : null}
      {sortField ? <input type="hidden" name="dir" value={direction} /> : null}
      <input
        name="q"
        defaultValue={search ?? ""}
        placeholder="Search…"
        className="h-6 w-28 rounded-md border border-input bg-transparent px-1.5 text-[11px] text-foreground"
      />
      <button
        type="submit"
        className="h-6 rounded-md border border-input px-2 text-[11px] hover:bg-accent"
      >
        Apply
      </button>
    </form>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Panel
        className="min-h-0 flex-1"
        title={
          <span>
            {decl.displayName} · <span className="tabular-nums">{total}</span>
          </span>
        }
        actions={
          <span className="flex items-center gap-2">
            {decl.name === "automation" && actor.role === "engineer" ? <ReconcileRuns /> : null}
            {filterRow}
          </span>
        }
        bodyClassName="flex flex-col"
      >
        {clusters.flatMap(({ cluster, groups }) =>
          groups.map((group) => (
            <Link
              key={`${cluster.id}:${group.key}`}
              href={href({ inspect: `${cluster.id}:${group.key}` })}
              data-testid="cluster-alert"
              className="group m-3 mb-0 flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/[0.07] p-3 transition-colors hover:border-amber-500/70 hover:bg-amber-500/[0.12]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                <Icon name="TriangleAlert" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {group.headline ?? chipLabel(group)}
                </span>
                {group.detail ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{group.detail}</span>
                ) : null}
              </span>
              <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-amber-400 px-3 text-xs font-medium text-black group-hover:bg-amber-300">
                Take a look
                <Icon name="ArrowRight" className="size-3.5" />
              </span>
            </Link>
          )),
        )}
        <StatStrip decl={decl} actor={actor} />
        <Table>
          <TableHeader>
            <TableRow>
              {decl.listColumns.map((column) => {
                const label =
                  column.label ??
                  decl.fields.find((f) => f.name === column.field)?.label ??
                  humanize(column.field);
                const active = sortField === column.field;
                return (
                  <TableHead
                    key={column.field}
                    className={column.align === "right" ? "text-right" : undefined}
                  >
                    {column.sortable ? (
                      <Link
                        href={sortHref(column.field)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {label}
                        <Icon
                          name={
                            active
                              ? direction === "asc"
                                ? "ArrowUp"
                                : "ArrowDown"
                              : "ChevronsUpDown"
                          }
                          className={cn(
                            "size-3",
                            active ? "text-foreground" : "text-muted-foreground/50",
                          )}
                        />
                      </Link>
                    ) : (
                      label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const masked = maskRecord(decl, row, actor);
              return (
                <TableRow key={row.id} className="hover:bg-accent/40">
                  {decl.listColumns.map((column, index) => (
                    <TableCell
                      key={column.field}
                      className={cn(
                        columnIsNumeric(decl, column) && "text-right tabular-nums",
                        index === 0 && "font-mono",
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
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={decl.listColumns.length}
                  className="py-10 text-center text-xs text-muted-foreground"
                >
                  Nothing matches these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Panel>

      {open ? (
        <ClusterDrawer
          label={open.group.label}
          headline={open.group.headline ?? chipLabel(open.group)}
          detail={open.group.detail}
          limit={open.group.limit}
          totalUsdMinor={open.group.totalUsdMinor}
          statuses={decl.statuses}
          rows={clusterRows(decl, open.cluster, open.group, actor)}
          canRequestRule={decl.revealRoles.includes(actor.role)}
          dispatch={dispatchOffer(open.cluster, open.group, actor)}
        />
      ) : null}

      {pages > 1 ? (
        <div className="flex h-8 shrink-0 items-center justify-end gap-2 border-t border-border px-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            Page {current} of {pages}
          </span>
          {current > 1 ? (
            <Link
              href={href({ page: String(current - 1) })}
              className="rounded-md border border-input px-2 py-0.5 hover:bg-accent"
            >
              Previous
            </Link>
          ) : null}
          {current < pages ? (
            <Link
              href={href({ page: String(current + 1) })}
              className="rounded-md border border-input px-2 py-0.5 hover:bg-accent"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The run this actor may ask for from the open group, or null when the cluster has no spec or the role may start nothing. */
function dispatchOffer(
  cluster: ClusterDecl,
  group: ClusterGroup,
  actor: Actor,
): DispatchOffer | null {
  const spec = cluster.handoffSpec ? getSpec(cluster.handoffSpec) : undefined;
  if (!spec) return null;
  // Reversals start from the merged run on /runs, not from evidence.
  const kinds = kindsStartableBy(actor.role, spec)
    .filter((kind) => kind !== "REVERSAL")
    .map((kind) => ({ kind, intent: spec.intents[kind] ?? "" }));
  if (kinds.length === 0) return null;
  return {
    spec: spec.file,
    clusterKey: group.key,
    evidenceIds: group.recordIds,
    kinds,
    simulations:
      devinMode() === "simulation" ? simulationsFor(spec.file, kinds.map((k) => k.kind)) : null,
  };
}

function resolveGroup(
  clusters: { cluster: ClusterDecl; groups: ClusterGroup[] }[],
  inspect: string,
): { cluster: ClusterDecl; group: ClusterGroup } | undefined {
  const separator = inspect.indexOf(":");
  if (separator < 0) return undefined;
  const clusterId = inspect.slice(0, separator);
  const groupKey = inspect.slice(separator + 1);
  const entry = clusters.find(({ cluster }) => cluster.id === clusterId);
  const group = entry?.groups.find((g) => g.key === groupKey);
  return entry && group ? { cluster: entry.cluster, group } : undefined;
}

/** `Kestrel Outdoors · 4 not_received · $1,880 · 14d` */
function chipLabel(group: ClusterGroup): string {
  const parts = [
    group.label,
    group.qualifier ? `${group.count} ${group.qualifier}` : String(group.count),
    (group.totalUsdMinor / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }),
  ];
  if (group.windowDays) parts.push(`${group.windowDays}d`);
  return parts.join(" · ");
}

/** Rows behind a group, each with its live policy trace. */
function clusterRows(
  decl: ToolDeclaration,
  cluster: ClusterDecl,
  group: ClusterGroup,
  actor: Actor,
): ClusterRow[] {
  const currencyField = decl.fields.find((f) => f.type === "currency" && f.currencyField);
  return group.recordIds.flatMap((id) => {
    const record = decl.get(id);
    if (!record) return [];
    const preview = cluster.traceAction
      ? previewActions(decl, record, actor).find((p) => p.action === cluster.traceAction)
      : undefined;
    const decision = preview?.decision ?? null;
    const amount = currencyField ? record[currencyField.name] : record.usdMinor;
    const currency = currencyField?.currencyField
      ? record[currencyField.currencyField]
      : "USD";
    return [
      {
        id: record.id,
        href: `/t/${decl.name}/${record.id}`,
        title: String(record[decl.titleField] ?? record.id),
        status: String(record[decl.statusField]),
        amountMinor: typeof amount === "number" ? amount : 0,
        currency: typeof currency === "string" ? currency : "USD",
        usdMinor: typeof record.usdMinor === "number" ? record.usdMinor : 0,
        requestedAt: typeof record.requestedAt === "number" ? record.requestedAt : null,
        trace: decision?.trace ?? null,
        pendingApproval: decision?.effect === "require_approval",
      },
    ];
  });
}

/** Declaration identifiers are snake_case; column and count labels are not. */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
