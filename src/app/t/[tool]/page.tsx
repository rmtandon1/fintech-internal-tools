import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { StatusChip } from "@/components/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { maskRecord } from "@/engine/pii/mask";
import { formatFieldValue } from "@/lib/format";
import { currentActor } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getTool } from "@/tools";

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
  if (!decl || !decl.visibleTo.includes(actor.role)) notFound();

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

  const sortHref = (field: string) =>
    href({
      sort: field,
      dir: sortField === field && direction === "desc" ? "asc" : "desc",
      page: "1",
    });

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon name={decl.icon} className="size-4.5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">{decl.displayName}</h1>
          <p className="text-sm text-muted-foreground">{decl.description}</p>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {total} {(total === 1 ? decl.recordType : `${decl.recordType}s`).replace(/_/g, " ")}
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        {decl.filters.map((filter) => (
          <label key={filter.field} className="space-y-1 text-[11px] text-muted-foreground">
            <span className="block">{filter.label}</span>
            {filter.type === "enum" ? (
              <select
                name={filter.field}
                defaultValue={filters[filter.field] ?? "all"}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              >
                <option value="all">All</option>
                {filter.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={filter.field}
                defaultValue={filters[filter.field] ?? ""}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              />
            )}
          </label>
        ))}
        {sortField ? <input type="hidden" name="sort" value={sortField} /> : null}
        {sortField ? <input type="hidden" name="dir" value={direction} /> : null}
        <label className="space-y-1 text-[11px] text-muted-foreground">
          <span className="block">Search</span>
          <input
            name="q"
            defaultValue={search ?? ""}
            placeholder="id, name…"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          />
        </label>
        <button
          type="submit"
          className="h-8 rounded-md border border-input px-3 text-xs hover:bg-accent"
        >
          Apply
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border">
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
                  {decl.listColumns.map((column, index) => {
                    const field = decl.fields.find((f) => f.name === column.field);
                    const isStatus = column.field === decl.statusField;
                    const content = isStatus ? (
                      <StatusChip
                        value={String(row[decl.statusField])}
                        statuses={decl.statuses}
                      />
                    ) : field ? (
                      formatFieldValue(field, masked.values)
                    ) : (
                      String(masked.values[column.field] ?? "—")
                    );
                    return (
                      <TableCell
                        key={column.field}
                        className={column.align === "right" ? "text-right" : undefined}
                      >
                        {index === 0 ? (
                          <Link
                            href={`/t/${decl.name}/${row.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={decl.listColumns.length}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nothing matches these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Page {current} of {pages}
          </span>
          {current > 1 ? (
            <Link
              href={href({ page: String(current - 1) })}
              className="rounded-md border border-input px-2 py-1 hover:bg-accent"
            >
              Previous
            </Link>
          ) : null}
          {current < pages ? (
            <Link
              href={href({ page: String(current + 1) })}
              className="rounded-md border border-input px-2 py-1 hover:bg-accent"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Declaration identifiers are snake_case; column and count labels are not. */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
