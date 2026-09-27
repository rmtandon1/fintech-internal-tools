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
import { PatternMonitor } from "@/components/pattern-monitor";
import { ReconcileRuns } from "@/components/reconcile-runs";
import { ToggleGrid } from "@/components/toggle-grid";
import { buildHandoffOffer, type HandoffOffer } from "@/lib/handoff";
import { bridgeDeps } from "@/lib/bridge";
import { getSpec, kindsStartableBy } from "@console/tool-automation";
import { currentActor } from "@/lib/session";
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

  // A tool with switches opens on them; `view=table` shows the full columns.
  const view = decl.toggle && query.view !== "table" ? "toggles" : "table";

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
    if (view === "table" && decl.toggle) next.set("view", "table");
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
      className="flex flex-wrap items-center gap-2 font-normal"
    >
      {decl.filters.map((filter) =>
        filter.type === "enum" ? (
          <select
            key={filter.field}
            name={filter.field}
            defaultValue={filters[filter.field] ?? "all"}
            title={filter.label}
            className="h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-xs"
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
            className="h-8 w-32 rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-xs"
          />
        ),
      )}
      {sortField ? <input type="hidden" name="sort" value={sortField} /> : null}
      {sortField ? <input type="hidden" name="dir" value={direction} /> : null}
      {view === "table" && decl.toggle ? <input type="hidden" name="view" value="table" /> : null}
      <input
        name="q"
        defaultValue={search ?? ""}
        placeholder="Search"
        className="h-8 w-44 rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-xs"
      />
      <button
        type="submit"
        className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
      >
        Filter
      </button>
    </form>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-card shadow-xs">
          <Icon name={decl.icon} className="size-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold leading-tight tracking-tight">
            {decl.displayName}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {total}
            </span>
          </h1>
          <p className="truncate text-sm text-muted-foreground">{decl.description}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {decl.name === "automation" && actor.role === "engineer" ? <ReconcileRuns /> : null}
          {decl.toggle ? (
            <div className="flex h-8 items-center rounded-md border border-border bg-card p-0.5 text-sm shadow-xs">
              {(["toggles", "table"] as const).map((option) => (
                <Link
                  key={option}
                  href={href({ view: option, page: "1" })}
                  aria-current={view === option ? "page" : undefined}
                  className={cn(
                    "flex h-full items-center gap-1.5 rounded-[5px] px-2.5",
                    view === option
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon name={option === "toggles" ? "ToggleRight" : "Table"} className="size-3.5" />
                  {option === "toggles" ? "Switches" : "Table"}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <StatStrip decl={decl} actor={actor} />

      <Panel className="min-h-0 flex-1" title={filterRow} bodyClassName="flex flex-col">
        {view === "toggles" && decl.toggle ? (
          <ToggleGrid decl={decl} toggle={decl.toggle} rows={rows} actor={actor} />
        ) : (
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
                  Nothing matches. Try clearing the filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        )}
      </Panel>

      {clusters.length > 0 ? (
        <PatternMonitor
          toolName={decl.displayName}
          scanned={first.total}
          looksFor={clusters.map(({ cluster }) => cluster.label)}
          findings={clusters.flatMap(({ cluster, groups }) =>
            groups.map((group) => ({
              key: `${cluster.id}:${group.key}`,
              headline: group.headline ?? chipLabel(group),
              detail: group.detail,
              href: href({ inspect: `${cluster.id}:${group.key}` }),
            })),
          )}
        />
      ) : null}

      {open ? (
        <ClusterDrawer
          label={open.group.label}
          headline={open.group.headline ?? chipLabel(open.group)}
          detail={open.group.detail}
          limit={open.group.limit}
          totalUsdMinor={open.group.totalUsdMinor}
          statuses={decl.statuses}
          ruleLabels={decl.ruleLabels}
          rows={clusterRows(decl, open.cluster, open.group, actor)}
          canRequestRule={decl.revealRoles.includes(actor.role)}
          dispatch={dispatchOffer(decl, open.cluster, open.group, actor)}
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

/** The handoffs this actor may ask Devin for from the open group. */
function dispatchOffer(
  decl: ToolDeclaration,
  cluster: ClusterDecl,
  group: ClusterGroup,
  actor: Actor,
): HandoffOffer[] | null {
  const spec = cluster.handoffSpec ? getSpec(cluster.handoffSpec) : undefined;
  if (!spec) return null;
  const deps = bridgeDeps();
  const offers = kindsStartableBy(actor.role, spec)
    .filter((kind) => kind !== "REVERSAL")
    .map((kind) =>
      buildHandoffOffer(
        spec,
        kind,
        actor,
        { clusterKey: group.key, evidenceIds: group.recordIds },
        deps,
      ),
    )
    .filter((o): o is HandoffOffer => o !== null);
  return offers.length > 0 ? offers : null;
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
