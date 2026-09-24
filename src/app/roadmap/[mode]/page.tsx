import { notFound } from "next/navigation";
import { Panel } from "@/components/panel";
import { OPS_MODES } from "@/lib/modes";
import { getTool } from "@/tools";

/** Landing page for a declared mode that has no tool behind it yet. */
export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode: id } = await params;
  const mode = OPS_MODES.find((m) => m.id === id);
  if (!mode || getTool(id)) notFound();

  return (
    <Panel
      title={mode.name}
      actions={
        <span className="text-[10px] uppercase text-muted-foreground">
          not built
        </span>
      }
      className="h-full"
    >
      <p className="p-3 text-xs text-muted-foreground">
        {mode.description} Actions:{" "}
        <span className="font-mono">{mode.actions.join(", ")}</span>. Roles:{" "}
        {mode.roles.join(", ")}.
      </p>
    </Panel>
  );
}
