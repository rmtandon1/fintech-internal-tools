import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardContent className="space-y-5 py-8 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon name={mode.icon} className="size-5" />
          </div>

          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{mode.name}</h1>
            <p className="text-sm text-muted-foreground">{mode.description}</p>
          </div>

          <p className="text-sm text-muted-foreground">
            This mode is scheduled for a future release. Its actions will run through the
            same governed write path as every other mode: validate → idempotency → policy
            → approval → effect → audit.
          </p>

          <div className="flex flex-wrap justify-center gap-1">
            {mode.actions.map((action) => (
              <span
                key={action}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {action}
              </span>
            ))}
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href="/">Back to operations home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
