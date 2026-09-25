import { Panel } from "@/components/panel";
import { ReplayBadge } from "@/components/replay-badge";
import { formatRelative } from "@console/ui/format";
import type { BridgeMode, DevinRun } from "@console/tool-automation";
import type { ReplayFrame } from "@console/tool-automation/run-files";

/**
 * The run's files as the server sees them: whether `context.json` is on disk
 * and the replay frames polled so far. Read-only; nothing here is a write.
 */
export function RunFiles({
  run,
  mode,
  contextPresent,
  frames,
  prUrl,
}: {
  run: DevinRun;
  mode: BridgeMode;
  contextPresent: boolean;
  frames: ReplayFrame[];
  prUrl: string | null;
}) {
  const latest = frames[frames.length - 1];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Run files <ReplayBadge mode={mode} />
        </span>
      }
      className="mx-3 mb-3"
      bodyClassName="p-3 text-xs"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">context.json</dt>
        <dd className="font-mono break-all">
          {contextPresent ? `runs/${run.id}/context.json` : "not on disk"} · sha256{" "}
          {run.contextSha256.slice(0, 16)}…
        </dd>
        <dt className="text-muted-foreground">replay.json</dt>
        <dd className="tabular-nums">
          {frames.length} frame{frames.length === 1 ? "" : "s"}
          {latest ? ` · last ${formatRelative(latest.at_ms)}` : ""}
          {mode === "replay" && frames.length > 0 ? " · replayed from a fixture" : ""}
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
      {frames.length > 0 ? (
        <ol className="mt-3 divide-y divide-border border-t border-border">
          {frames
            .slice()
            .reverse()
            .map((frame) => (
              <li key={frame.at_ms} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                <span className="font-mono text-muted-foreground tabular-nums">
                  {new Date(frame.at_ms).toISOString().slice(11, 19)}
                </span>
                <span className="font-mono">{frame.status}</span>
                <span className="rounded bg-muted px-1 font-mono">
                  {frame.structured_output.phase} · {frame.structured_output.phase_status}
                </span>
                {frame.structured_output.branch ? (
                  <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                    {frame.structured_output.branch}
                  </span>
                ) : null}
                {frame.status_detail ? (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{frame.status_detail}</span>
                ) : null}
              </li>
            ))}
        </ol>
      ) : null}
    </Panel>
  );
}
