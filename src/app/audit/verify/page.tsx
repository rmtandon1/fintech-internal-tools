import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GENESIS_HASH } from "@/engine/audit/chain";
import { verifyChain } from "@/engine/audit/verify";
import { currentActor } from "@/lib/session";
import { cn } from "@/lib/utils";

const BREAK_EXPLANATIONS: Record<string, string> = {
  seq_gap: "A row was deleted: the sequence is no longer dense.",
  prev_mismatch: "A row was inserted or reordered: its prev_hash does not follow.",
  row_hash_mismatch: "A row's contents were edited in place: the hash no longer matches.",
};

export default async function VerifyPage() {
  const actor = await currentActor();
  if (actor.role !== "admin") notFound();

  const result = verifyChain();

  return (
    <div className="max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Audit chain verification</h1>
        <p className="text-sm text-muted-foreground">
          Recomputes every row hash from its canonical contents and the previous row&apos;s
          hash, starting from the genesis constant.
        </p>
      </header>

      <Card
        className={cn(
          result.ok ? "border-emerald-500/30" : "border-red-500/40",
        )}
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Icon
              name={result.ok ? "ShieldCheck" : "ShieldX"}
              className={cn("size-4", result.ok ? "text-emerald-400" : "text-red-400")}
            />
            {result.ok
              ? `Chain intact across ${result.length} events`
              : `Chain broken at event #${result.firstBreak?.seq}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
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
        </CardContent>
      </Card>
    </div>
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
