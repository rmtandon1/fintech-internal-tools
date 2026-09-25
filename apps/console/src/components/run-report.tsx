import type { StructuredOutput } from "@console/tool-automation/run-files";
import { Icon } from "@console/ui/icon";
import { cn } from "@console/ui/utils";
import { PHASE_LABELS, PHASE_ORDER, PHASE_SHORT } from "@/lib/run-phases";

/**
 * Everything a Devin session reported, laid out for review: how long each
 * phase took, every check and safety guard, each file with its line counts
 * and reason, what it reused and any clash it resolved. Presentational only,
 * so the live run page (server) and the preview in the Ask Devin dialog
 * (client) share it.
 */
export function RunReport({ output }: { output: StructuredOutput }) {
  const additions = output.files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = output.files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="space-y-6 text-sm">
      <Timeline output={output} />
      <Checks output={output} />

      {output.files.length > 0 ? (
        <Section
          title="Files changed"
          aside={
            <span className="tabular-nums">
              {output.files.length} {output.files.length === 1 ? "file" : "files"} ·{" "}
              <span className="text-emerald-400">+{additions}</span>{" "}
              <span className="text-red-400">−{deletions}</span>
            </span>
          }
        >
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {output.files.map((file) => (
              <FileRow key={file.path} file={file} />
            ))}
          </ul>
        </Section>
      ) : null}

      {output.conflicts.length > 0 ? (
        <Section title="Clashes resolved">
          <ul className="space-y-2">
            {output.conflicts.map((conflict) => (
              <li
                key={conflict.file}
                className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3"
              >
                <Path path={conflict.file} />
                <p className="mt-1 text-muted-foreground">
                  Kept <span className="text-foreground">{conflict.kept}</span>. Removed{" "}
                  <span className="text-foreground">{conflict.removed}</span>.
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {output.reuses.length > 0 ? (
        <Section title="Built on existing code">
          <ul className="space-y-2">
            {output.reuses.map((reuse) => (
              <li key={reuse.module} className="flex flex-col gap-0.5">
                <Path path={reuse.module} />
                <span className="text-muted-foreground">{reuse.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <References output={output} />
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Each phase as a segment sized by how long it took; the current one is marked. */
function Timeline({ output }: { output: StructuredOutput }) {
  const at = PHASE_ORDER.indexOf(output.phase);
  const phases = PHASE_ORDER.filter(
    (phase, i) => output.phase_durations_s[phase] !== undefined || i <= at,
  );
  const total = phases.reduce((sum, p) => sum + (output.phase_durations_s[p] ?? 0), 0);
  if (phases.length === 0) return null;

  return (
    <Section
      title={PHASE_LABELS[output.phase]}
      aside={total > 0 ? `Took ${duration(total)}` : undefined}
    >
      <div className="flex gap-1">
        {phases.map((phase) => {
          const seconds = output.phase_durations_s[phase];
          const i = PHASE_ORDER.indexOf(phase);
          const current = i === at && output.phase_status !== "done";
          return (
            <div
              key={phase}
              className="min-w-14 space-y-1.5"
              style={{ flexGrow: Math.max(seconds ?? 0, total / 12) }}
            >
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  current ? "animate-pulse bg-amber-400" : i <= at ? "bg-emerald-400/80" : "bg-muted",
                )}
              />
              <div className="text-xs leading-tight">
                <div className={i <= at ? "text-foreground" : "text-muted-foreground"}>
                  {PHASE_SHORT[phase]}
                </div>
                {seconds !== undefined ? (
                  <div className="tabular-nums text-muted-foreground">{duration(seconds)}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const STEP_NAMES: Record<string, string> = {
  lint: "Lint",
  typecheck: "Types",
  boundaries: "Boundaries",
  tests: "Tests",
};

function Checks({ output }: { output: StructuredOutput }) {
  const { verify_steps: steps, guards } = output;
  if (steps.length === 0 && guards.length === 0) return null;
  const guardsFailed = guards.filter((g) => g.pass === false).length;
  const guardsPassed = guards.filter((g) => g.pass === true).length;

  return (
    <Section title="Checks">
      {steps.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map((step) => (
            <div key={step.name} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{STEP_NAMES[step.name] ?? step.name}</span>
                <Status pass={step.pass} />
              </div>
              {step.before !== undefined ? (
                <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {step.before}
                  {step.after !== undefined ? ` → ${step.after ?? "…"}` : ""} tests
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">
                  {step.pass === true ? "Passed" : step.pass === false ? "Failed" : "Running"}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {guards.length > 0 ? (
        <div className="rounded-lg border border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Safety checks</span>
            <span
              className={cn(
                "text-xs",
                guardsFailed > 0 ? "text-red-400" : "text-muted-foreground",
              )}
            >
              {guardsFailed > 0
                ? `${guardsFailed} failed`
                : `${guardsPassed} of ${guards.length} passed`}
            </span>
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {guards.map((guard) => (
              <li
                key={guard.name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  guard.pass === false
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : guard.pass === null
                      ? "border-border text-muted-foreground"
                      : "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200",
                )}
              >
                <Status pass={guard.pass} small />
                {guard.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

const OP = {
  create: { label: "Added", className: "bg-emerald-500/15 text-emerald-300" },
  modify: { label: "Edited", className: "bg-sky-500/15 text-sky-300" },
  delete: { label: "Removed", className: "bg-red-500/15 text-red-300" },
} as const;

function FileRow({ file }: { file: StructuredOutput["files"][number] }) {
  const op = OP[file.op as keyof typeof OP] ?? OP.modify;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-0.5 w-16 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-medium",
          op.className,
        )}
      >
        {op.label}
      </span>
      <div className="min-w-0 flex-1">
        <Path path={file.path} />
        <p className="mt-0.5 text-muted-foreground">{file.reason}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs tabular-nums">
        <span>
          <span className="text-emerald-400">+{file.additions}</span>{" "}
          <span className="text-red-400">−{file.deletions}</span>
        </span>
        <DiffBar additions={file.additions} deletions={file.deletions} />
      </div>
    </li>
  );
}

/** Five blocks split between added and removed lines, as code review tools draw it. */
function DiffBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  // Any removed line keeps at least one red block, and any added line one green.
  const added =
    total === 0
      ? 0
      : Math.min(deletions > 0 ? 4 : 5, Math.max(additions > 0 ? 1 : 0, Math.round((additions / total) * 5)));
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2 rounded-[2px]",
            total === 0 ? "bg-muted" : i < added ? "bg-emerald-400" : "bg-red-400",
          )}
        />
      ))}
    </span>
  );
}

/** A path with its folder dimmed, so the file name is what the eye lands on. */
function Path({ path }: { path: string }) {
  const cut = path.lastIndexOf("/");
  return (
    <span className="block break-all font-mono text-[13px]">
      {cut >= 0 ? <span className="text-muted-foreground">{path.slice(0, cut + 1)}</span> : null}
      <span className="text-foreground">{path.slice(cut + 1)}</span>
    </span>
  );
}

function Status({ pass, small }: { pass: boolean | null; small?: boolean }) {
  const size = small ? "size-3.5" : "size-4";
  if (pass === true) return <Icon name="CircleCheck" className={cn(size, "text-emerald-400")} />;
  if (pass === false) return <Icon name="CircleX" className={cn(size, "text-red-400")} />;
  return <Icon name="Loader2" className={cn(size, "animate-spin text-amber-400")} />;
}

/** Where to find the work: branch, commits and pull request. */
function References({ output }: { output: StructuredOutput }) {
  const rows: [string, React.ReactNode][] = [];
  if (output.branch) rows.push(["Branch", output.branch]);
  if (output.base_commit) rows.push(["Started from", output.base_commit.slice(0, 7)]);
  if (output.plan_commit) rows.push(["Plan committed", output.plan_commit.slice(0, 7)]);
  if (output.pr_url) {
    rows.push([
      "Pull request",
      <a
        key="pr"
        href={output.pr_url}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-4 hover:underline"
      >
        {output.pr_url.replace(/^https:\/\/github\.com\//, "")}
      </a>,
    ]);
  }
  if (output.merge_commit) rows.push(["Merged as", output.merge_commit.slice(0, 7)]);
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-border pt-4 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all font-mono text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
