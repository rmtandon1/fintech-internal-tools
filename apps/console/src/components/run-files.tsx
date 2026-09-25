import { Panel } from "@/components/panel";
import type { DevinRun } from "@console/tool-automation";

/**
 * The run's files as the server sees them: whether `context.json` is on disk
 * and the pull request the run points at. Read-only; nothing here is a write.
 */
export function RunFiles({
  run,
  contextPresent,
  prUrl,
}: {
  run: DevinRun;
  contextPresent: boolean;
  prUrl: string | null;
}) {
  return (
    <Panel title="Run files" className="mx-3 mb-3" bodyClassName="p-3 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">context.json</dt>
        <dd className="font-mono break-all">
          {contextPresent ? `runs/${run.id}/context.json` : "not on disk"} · sha256{" "}
          {run.contextSha256.slice(0, 16)}…
        </dd>
        <dt className="text-muted-foreground">Pull request</dt>
        <dd className="font-mono break-all">
          {prUrl ? (
            <a href={prUrl} target="_blank" rel="noreferrer" className="hover:underline">
              {prUrl}
            </a>
          ) : (
            "not reported yet"
          )}
        </dd>
      </dl>
    </Panel>
  );
}
