import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { Panel } from "@/components/panel";
import { GENESIS_HASH } from "@/engine/audit/chain";
import { verifyChain } from "@/engine/audit/verify";
import { currentActor } from "@/lib/session";
import { cn } from "@/lib/utils";

const BREAK_EXPLANATIONS: Record<string, string> = {
  seq_gap: "A row was deleted: the sequence is no longer dense.",
  prev_mismatch: "A row was inserted or reordered: its prev_hash does not follow.",
  row_hash_mismatch: "A row's contents were edited in place: the hash no longer matches.",
  head_mismatch:
    "The end of the log was removed: the head checkpoint records a row the log no longer has.",
};

export default async function VerifyPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") notFound();

  const result = verifyChain();

  return (
    <Panel
      className="h-full"
      title={
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <Icon
            name={result.ok ? "ShieldCheck" : "ShieldX"}
            className={cn("size-3.5", result.ok ? "text-emerald-400" : "text-red-400")}
          />
          {result.ok
            ? `Chain intact across ${result.length} events`
            : `Chain broken at event #${result.firstBreak?.seq}`}
        </span>
      }
      bodyClassName="space-y-3 p-3 text-xs"
    >
      {result.firstBreak ? (
        <div className="space-y-1 rounded-md border border-red-500/30 bg-red-500/5 p-3">
          <div className="font-medium text-red-400">{result.firstBreak.type}</div>
          <p className="text-muted-foreground">
            {BREAK_EXPLANATIONS[result.firstBreak.type]}
          </p>
          <p className="font-mono text-[11px]">{result.firstBreak.detail}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {result.firstBreak.id}
          </p>
        </div>
      ) : null}

      <dl className="grid gap-2 sm:grid-cols-2">
        <Row label="Events" value={String(result.length)} />
        <Row label="Status" value={result.ok ? "verified" : "failed"} />
        <Row label="Genesis" value={GENESIS_HASH} mono />
        <Row label="Head hash" value={result.lastHash} mono />
      </dl>
    </Panel>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("break-all", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}
