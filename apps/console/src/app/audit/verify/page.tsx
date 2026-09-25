import { redirect } from "next/navigation";
import { Icon } from "@console/ui/icon";
import { Panel } from "@/components/panel";
import { GENESIS_HASH } from "@console/engine/audit/chain";
import { verifyChain } from "@console/engine/audit/verify";
import { currentActor } from "@/lib/session";
import { cn } from "@console/ui/utils";

const BREAK_EXPLANATIONS: Record<string, string> = {
  seq_gap: "An entry was deleted.",
  prev_mismatch: "An entry was inserted or moved.",
  row_hash_mismatch: "An entry was edited after it was written.",
  head_mismatch: "The newest entries were removed from the end of the log.",
};

export default async function VerifyPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") redirect("/");

  const result = verifyChain();

  return (
    <Panel
      className="h-full"
      title={
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <Icon
            name={result.ok ? "ShieldCheck" : "ShieldX"}
            className={cn("size-3.5", result.ok ? "text-success" : "text-destructive")}
          />
          {result.ok
            ? `Audit log verified: all ${result.length} entries are intact`
            : `Audit log tampered with at entry #${result.firstBreak?.seq}`}
        </span>
      }
      bodyClassName="space-y-3 p-3 text-xs"
    >
      {result.firstBreak ? (
        <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="text-sm font-medium text-destructive">
            {BREAK_EXPLANATIONS[result.firstBreak.type] ?? result.firstBreak.type}
          </div>
          <p className="font-mono text-[11px]">{result.firstBreak.detail}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {result.firstBreak.id}
          </p>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Every entry carries a fingerprint of the one before it, so editing, deleting or
        reordering any entry breaks every fingerprint after it. This page recomputes them all.
      </p>

      <dl className="grid gap-2 sm:grid-cols-2">
        <Row label="Entries checked" value={String(result.length)} />
        <Row label="Result" value={result.ok ? "Intact" : "Tampered with"} />
      </dl>

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Technical details
        </summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          <Row label="First hash" value={GENESIS_HASH} mono />
          <Row label="Latest hash" value={result.lastHash} mono />
        </dl>
      </details>
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
