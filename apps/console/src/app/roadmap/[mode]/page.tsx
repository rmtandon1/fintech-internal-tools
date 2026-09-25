import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@console/ui/button";
import { Icon } from "@console/ui/icon";
import { Panel } from "@/components/panel";
import { OPS_MODES } from "@/lib/modes";
import { roleLabel } from "@console/permissions";
import { getTool } from "@/registry";

/** What every tool gets from the engine, so a pending mode would too. */
const INHERITED = [
  { name: "Access by role", detail: "Only the roles listed above can see it." },
  { name: "Checks on every action", detail: "Every action shows which rules it passed or failed." },
  { name: "Approvals", detail: "Large actions wait for a manager. Nobody approves their own." },
  { name: "Live settings", detail: "Limits change on the rule settings page, with no release." },
  { name: "No double actions", detail: "Clicking twice, or retrying, never does it twice." },
  { name: "Personal data hidden", detail: "Personal data is masked. Every reveal is logged." },
  { icon: "Link2", name: "Tamper-proof audit log", detail: "Every action is logged, and any edit to the log is detected." },
];

// Fixed widths so the placeholder rows look like data without pretending to be any.
const SAMPLE_WIDTHS = ["w-20", "w-28", "w-16", "w-24", "w-14", "w-24", "w-20", "w-12"];

/** Preview for a declared mode that has no tool behind it yet. */
export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode: id } = await params;
  const mode = OPS_MODES.find((m) => m.id === id);
  if (!mode || getTool(id)) notFound();
  const columns = mode.columns ?? ["Record", "Customer", "Amount", "Status"];

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <Icon name="ChevronRight" className="size-3" />
        <span>{mode.area}</span>
      </div>

      <section className="flex items-start gap-4 rounded-md border border-border bg-card p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
          <Icon name={mode.icon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{mode.name}</h1>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
              Coming soon
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{mode.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mode.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {roleLabel(role)}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Queue"
          actions={<span className="text-[11px] text-muted-foreground">Sample layout, no data yet</span>}
        >
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody aria-hidden>
              {Array.from({ length: 7 }, (_, row) => (
                <tr key={row} className="border-b border-border/50" style={{ opacity: 1 - row * 0.12 }}>
                  {columns.map((column, col) => (
                    <td key={column} className="px-3 py-2.5">
                      <div
                        className={`h-2.5 rounded-sm bg-muted ${SAMPLE_WIDTHS[(row + col * 3) % SAMPLE_WIDTHS.length]}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2 border-t border-border p-3">
            {mode.actions.map((action) => (
              <Button key={action} size="sm" variant="secondary" disabled>
                {action.replaceAll("_", " ")}
              </Button>
            ))}
          </div>
        </Panel>

        <Panel title="Included automatically">
          <ul className="flex flex-col">
            {INHERITED.map((item) => (
              <li key={item.name} className="flex gap-3 border-b border-border/50 px-3 py-2.5 last:border-0">
                <Icon name="Check" className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                <div>
                  <div className="text-xs font-medium text-foreground">{item.name}</div>
                  <div className="text-[11px] text-muted-foreground">{item.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
